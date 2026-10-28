package com.ascend.training;

import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.tensorflow.lite.Interpreter;
import org.tensorflow.lite.Tensor;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * On-device food recognition for the meal scanner — v11 classifier +
 * detector v1 (replaces the v1 15-dish model).
 *
 * Loads two bundled models from assets, entirely on-device: no
 * network, no photo ever leaves the phone.
 *
 *   Classifier (v11, 619 classes):
 *     models/indian_food_cls_int8.tflite + models/labels.txt
 *     input  [1, 224, 224, 3] UINT8 raw NHWC pixels — scale 1.0 /
 *            zero-point 0, so feed raw 0–255 bytes, no scaling.
 *     output [1, 619] UINT8 quantized LOGITS — dequantize with the
 *            output tensor's (scale, zeroPoint), then softmax.
 *            (Verified v11 contract: output scale 0.0785653,
 *            zero-point 190. The code reads them from the tensor
 *            rather than hard-coding them.)
 *
 *   Detector (NanoDet-Plus, 5 container classes):
 *     models/detector_v1_float32.tflite + models/detector_labels.txt
 *     (bowl_katori, flatbread, rice_mound, side_item, whole_dish)
 *     input  [1, 416, 416, 3] FLOAT32 NHWC — see DETECTOR preprocessing
 *            below; the FP16 artifact is NOT used (not CPU-runnable).
 *     output [1, 3598, 37] float32 RAW head output: 3598 anchors
 *            (52^2+26^2+13^2+7^2 at strides 8/16/32/64) x 37 channels
 *            = 5 class sigmoids + 4 x (reg_max 7 + 1) distribution
 *            values per anchor. Post-processing (decode + NMS) is NOT
 *            in the graph — this class implements it, mirroring the
 *            bench's head.post_process semantics (see decodeDetections).
 *
 * Detector preprocessing (VERIFIED, not guessed — from
 * ascend-ml/detector_v1_model/config_det_v1.yml val pipeline +
 * ascend-ml/detector_v1_bench.py, which feeds cv2.imread (BGR)
 * through NanoDet's Pipeline):
 *   1. resize STRETCHED to 416x416 (config keep_ratio: false — no
 *      letterbox/padding; aspect ratio is not preserved).
 *   2. channel order BGR (the mean/std below are in BGR order).
 *   3. per-channel normalize: (pixel - mean) / std with
 *      mean [103.53, 116.28, 123.675], std [57.375, 57.12, 58.395].
 *   4. NHWC float32 (onnx2tf transposed the ONNX NCHW input).
 *
 * Detector decode (mirrors NanoDet-Plus head.post_process):
 *   anchors are grid centres (col+0.5)*stride, (row+0.5)*stride,
 *   row-major within each stride level, levels in stride order
 *   8/16/32/64. Class score = sigmoid of the first 5 channels.
 *   Box distances come from the DFL distribution: softmax over each
 *   side's 8 bins, expected bin index x stride = pixel distance
 *   from the anchor centre (l, t, r, b). Score threshold 0.30
 *   matches the bench filter; NMS is per-class greedy IoU 0.5
 *   (app-side choice — the bench's post_process already NMS'd, so
 *   this threshold only dedupes what the raw head emits).
 *   Each surviving box is cropped with an 8% margin (bench margin),
 *   clamped to the photo, resized to 224x224 and classified.
 *
 * Written in Java to follow the AppSettingsPlugin precedent exactly:
 * the app module has no Kotlin Gradle plugin wired, and this class
 * must compile under the existing build with zero new build config
 * beyond the tensorflow-lite dependency in app/build.gradle.
 *
 * Every failure path rejects/resolves cleanly — a bad photo or a
 * model that cannot load must never crash the bridge; the web layer
 * falls back to the server AI scan.
 */
@CapacitorPlugin(name = "OfflineScan")
public class OfflineScanPlugin extends Plugin {

    private static final String CLASSIFIER_ASSET = "models/indian_food_cls_int8.tflite";
    private static final String LABELS_ASSET = "models/labels.txt";
    private static final String DETECTOR_ASSET = "models/detector_v1_float32.tflite";
    private static final String DETECTOR_LABELS_ASSET = "models/detector_labels.txt";

    private static final int CLASSIFIER_INPUT_SIZE = 224;
    private static final int DETECTOR_INPUT_SIZE = 416;
    private static final int TOP_K = 3;

    // Detector head geometry (see class doc).
    private static final int[] DETECTOR_STRIDES = {8, 16, 32, 64};
    private static final int DETECTOR_NUM_CLASSES = 5;
    private static final int DETECTOR_REG_MAX = 7;
    private static final int DETECTOR_CHANNELS = DETECTOR_NUM_CLASSES + 4 * (DETECTOR_REG_MAX + 1); // 37
    private static final float DETECTOR_SCORE_THRESHOLD = 0.30f;
    private static final float DETECTOR_NMS_IOU = 0.5f;
    private static final float CROP_MARGIN = 0.08f;
    private static final int MAX_DETECTIONS = 12;

    // NanoDet val-pipeline normalize, BGR order (config_det_v1.yml).
    private static final float[] DETECTOR_MEAN = {103.53f, 116.28f, 123.675f};
    private static final float[] DETECTOR_STD = {57.375f, 57.12f, 58.395f};

    private Interpreter classifierInterpreter;
    private Interpreter detectorInterpreter;
    private List<String> labels;
    private List<String> detectorLabels;

    // ── Model loading (lazy, once) ───────────────────────────────────

    private synchronized Interpreter getClassifierInterpreter() throws IOException {
        if (classifierInterpreter == null) {
            Interpreter.Options options = new Interpreter.Options();
            options.setNumThreads(4);
            options.setUseXNNPACK(true);
            classifierInterpreter = new Interpreter(loadModelBuffer(CLASSIFIER_ASSET), options);
        }
        return classifierInterpreter;
    }

    private synchronized Interpreter getDetectorInterpreter() throws IOException {
        if (detectorInterpreter == null) {
            Interpreter.Options options = new Interpreter.Options();
            options.setNumThreads(4);
            options.setUseXNNPACK(true);
            detectorInterpreter = new Interpreter(loadModelBuffer(DETECTOR_ASSET), options);
        }
        return detectorInterpreter;
    }

    private synchronized List<String> getLabels() throws IOException {
        if (labels == null) labels = readLabelAsset(LABELS_ASSET);
        return labels;
    }

    private synchronized List<String> getDetectorLabels() throws IOException {
        if (detectorLabels == null) detectorLabels = readLabelAsset(DETECTOR_LABELS_ASSET);
        return detectorLabels;
    }

    private List<String> readLabelAsset(String asset) throws IOException {
        List<String> out = new ArrayList<>();
        InputStream in = getContext().getAssets().open(asset);
        BufferedReader reader = new BufferedReader(new InputStreamReader(in));
        String line;
        while ((line = reader.readLine()) != null) {
            String trimmed = line.trim();
            if (!trimmed.isEmpty()) out.add(trimmed);
        }
        reader.close();
        return out;
    }

    /** Memory-map a model out of assets (kept uncompressed via
     *  aaptOptions noCompress 'tflite'); falls back to a direct buffer
     *  copy if mapping is unavailable for any reason. */
    private ByteBuffer loadModelBuffer(String asset) throws IOException {
        AssetManager assets = getContext().getAssets();
        try {
            AssetFileDescriptor fd = assets.openFd(asset);
            FileInputStream inputStream = new FileInputStream(fd.getFileDescriptor());
            FileChannel fileChannel = inputStream.getChannel();
            MappedByteBuffer mapped = fileChannel.map(
                FileChannel.MapMode.READ_ONLY, fd.getStartOffset(), fd.getDeclaredLength());
            inputStream.close();
            fd.close();
            return mapped;
        } catch (IOException | RuntimeException e) {
            InputStream in = assets.open(asset);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) >= 0) baos.write(chunk, 0, n);
            in.close();
            byte[] bytes = baos.toByteArray();
            ByteBuffer buffer = ByteBuffer.allocateDirect(bytes.length);
            buffer.order(ByteOrder.nativeOrder());
            buffer.put(bytes);
            buffer.rewind();
            return buffer;
        }
    }

    // ── Shared helpers ───────────────────────────────────────────────

    private static float sigmoid(float x) {
        return (float) (1.0 / (1.0 + Math.exp(-x)));
    }

    /** Dequantize UINT8 logits then softmax (max-subtracted). */
    private static float[] dequantizeSoftmax(byte[] quantized, float scale, int zeroPoint) {
        float[] logits = new float[quantized.length];
        float max = Float.NEGATIVE_INFINITY;
        for (int i = 0; i < quantized.length; i++) {
            logits[i] = ((quantized[i] & 0xFF) - zeroPoint) * scale;
            if (logits[i] > max) max = logits[i];
        }
        float sum = 0f;
        for (int i = 0; i < logits.length; i++) {
            logits[i] = (float) Math.exp(logits[i] - max);
            sum += logits[i];
        }
        if (sum > 0f) {
            for (int i = 0; i < logits.length; i++) logits[i] /= sum;
        }
        return logits;
    }

    /** Top-K indices of probs, descending. */
    private static List<Integer> topK(float[] probs, int k) {
        List<Integer> order = new ArrayList<>();
        for (int i = 0; i < probs.length; i++) order.add(i);
        order.sort((a, b) -> Float.compare(probs[b], probs[a]));
        return order.subList(0, Math.min(k, order.size()));
    }

    /** Classify one bitmap with v11 → top-K {label, score} entries. */
    private JSArray classifyBitmap(Bitmap source) throws IOException {
        Bitmap scaled = Bitmap.createScaledBitmap(source, CLASSIFIER_INPUT_SIZE, CLASSIFIER_INPUT_SIZE, true);
        try {
            ByteBuffer input = ByteBuffer.allocateDirect(
                CLASSIFIER_INPUT_SIZE * CLASSIFIER_INPUT_SIZE * 3);
            input.order(ByteOrder.nativeOrder());
            int[] pixels = new int[CLASSIFIER_INPUT_SIZE * CLASSIFIER_INPUT_SIZE];
            scaled.getPixels(pixels, 0, CLASSIFIER_INPUT_SIZE, 0, 0,
                CLASSIFIER_INPUT_SIZE, CLASSIFIER_INPUT_SIZE);
            for (int pixel : pixels) {
                input.put((byte) ((pixel >> 16) & 0xFF)); // R
                input.put((byte) ((pixel >> 8) & 0xFF));  // G
                input.put((byte) (pixel & 0xFF));         // B
            }
            input.rewind();

            Interpreter interp = getClassifierInterpreter();
            Tensor outputTensor = interp.getOutputTensor(0);
            int numClasses = outputTensor.shape()[1];
            byte[][] output = new byte[1][numClasses];
            interp.run(input, output);

            Tensor.QuantizationParams qp = outputTensor.quantizationParams();
            float[] probs = dequantizeSoftmax(output[0], qp.getScale(), qp.getZeroPoint());

            List<String> labelList = getLabels();
            JSArray results = new JSArray();
            for (int idx : topK(probs, TOP_K)) {
                JSObject entry = new JSObject();
                entry.put("label", idx < labelList.size() ? labelList.get(idx) : ("class_" + idx));
                entry.put("score", probs[idx]);
                results.put(entry);
            }
            return results;
        } finally {
            if (scaled != source) scaled.recycle();
        }
    }

    private static Bitmap decodePhoto(String data) {
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) {
            data = data.substring(comma + 1);
        }
        byte[] imageBytes = Base64.decode(data, Base64.DEFAULT);
        return BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
    }

    // ── Detector decode + NMS (app-side post-processing) ─────────────

    private static class Detection {
        // Box in ORIGINAL photo pixel coordinates (pre-margin crop box).
        float x1, y1, x2, y2;
        int classIndex;
        float score;
    }

    private static float boxIoU(Detection a, Detection b) {
        float ix1 = Math.max(a.x1, b.x1);
        float iy1 = Math.max(a.y1, b.y1);
        float ix2 = Math.min(a.x2, b.x2);
        float iy2 = Math.min(a.y2, b.y2);
        float iw = ix2 - ix1;
        float ih = iy2 - iy1;
        if (iw <= 0f || ih <= 0f) return 0f;
        float inter = iw * ih;
        float areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
        float areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
        return inter / (areaA + areaB - inter);
    }

    /**
     * Decode the raw [3598][37] head output into boxes in original
     * photo coordinates, then per-class greedy NMS. See class doc
     * for the anchor / DFL semantics.
     */
    private static List<Detection> decodeDetections(float[][] head, int origW, int origH) {
        List<Detection> kept = new ArrayList<>();
        List<Detection> all = new ArrayList<>();
        int anchor = 0;
        for (int stride : DETECTOR_STRIDES) {
            int feat = DETECTOR_INPUT_SIZE / stride;
            for (int row = 0; row < feat; row++) {
                for (int col = 0; col < feat; col++) {
                    if (anchor >= head.length) break;
                    float[] ch = head[anchor++];
                    // Best class by sigmoid score.
                    int bestClass = -1;
                    float bestScore = 0f;
                    for (int c = 0; c < DETECTOR_NUM_CLASSES; c++) {
                        float s = sigmoid(ch[c]);
                        if (s > bestScore) {
                            bestScore = s;
                            bestClass = c;
                        }
                    }
                    if (bestClass < 0 || bestScore < DETECTOR_SCORE_THRESHOLD) continue;
                    // DFL: softmax over each side's 8 bins, expected
                    // bin index x stride = pixel distance from centre.
                    float cx = (col + 0.5f) * stride;
                    float cy = (row + 0.5f) * stride;
                    float[] dist = new float[4];
                    for (int side = 0; side < 4; side++) {
                        int base = DETECTOR_NUM_CLASSES + side * (DETECTOR_REG_MAX + 1);
                        float dmax = Float.NEGATIVE_INFINITY;
                        for (int b = 0; b <= DETECTOR_REG_MAX; b++) {
                            if (ch[base + b] > dmax) dmax = ch[base + b];
                        }
                        float sum = 0f;
                        float expected = 0f;
                        for (int b = 0; b <= DETECTOR_REG_MAX; b++) {
                            float e = (float) Math.exp(ch[base + b] - dmax);
                            sum += e;
                            expected += e * b;
                        }
                        dist[side] = (sum > 0f ? expected / sum : 0f) * stride;
                    }
                    Detection d = new Detection();
                    d.x1 = Math.max(0f, cx - dist[0]) * origW / DETECTOR_INPUT_SIZE;
                    d.y1 = Math.max(0f, cy - dist[1]) * origH / DETECTOR_INPUT_SIZE;
                    d.x2 = Math.min(DETECTOR_INPUT_SIZE, cx + dist[2]) * origW / DETECTOR_INPUT_SIZE;
                    d.y2 = Math.min(DETECTOR_INPUT_SIZE, cy + dist[3]) * origH / DETECTOR_INPUT_SIZE;
                    if (d.x2 <= d.x1 || d.y2 <= d.y1) continue;
                    d.classIndex = bestClass;
                    d.score = bestScore;
                    all.add(d);
                }
            }
        }
        // Per-class greedy NMS, highest score first.
        all.sort((a, b) -> Float.compare(b.score, a.score));
        for (Detection cand : all) {
            boolean suppressed = false;
            for (Detection k : kept) {
                if (k.classIndex == cand.classIndex && boxIoU(k, cand) > DETECTOR_NMS_IOU) {
                    suppressed = true;
                    break;
                }
            }
            if (!suppressed) kept.add(cand);
            if (kept.size() >= MAX_DETECTIONS) break;
        }
        return kept;
    }

    // ── Bridge methods ───────────────────────────────────────────────

    /** { available, labels, detectorLabels, detector } — resolves
     *  (never rejects) so the web layer can treat any failure as
     *  "offline scan unavailable" and keep the server flow.
     *  available is true only when BOTH models load AND the label
     *  counts are exactly 619 classifier / 5 detector labels. */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        try {
            getClassifierInterpreter();
            getDetectorInterpreter();
            int nLabels = getLabels().size();
            int nDetLabels = getDetectorLabels().size();
            boolean ok = nLabels == 619 && nDetLabels == 5;
            result.put("available", ok);
            result.put("labels", nLabels);
            result.put("detectorLabels", nDetLabels);
            result.put("detector", ok);
        } catch (Exception e) {
            result.put("available", false);
            result.put("labels", 0);
            result.put("detectorLabels", 0);
            result.put("detector", false);
        }
        call.resolve(result);
    }

    /** classify({ data: base64 JPEG/PNG }) → { results: [{label, score}] }
     *  Whole-photo v11 top-3 by softmax probability. Kept as the
     *  fallback when the detector finds nothing (or fails). */
    @PluginMethod
    public void classify(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Offline scan: no image data provided.");
            return;
        }
        Bitmap bitmap = null;
        try {
            bitmap = decodePhoto(data);
            if (bitmap == null) {
                call.reject("Offline scan: could not decode the photo.");
                return;
            }
            JSObject result = new JSObject();
            result.put("results", classifyBitmap(bitmap));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Offline scan failed: " + e.getMessage());
        } finally {
            if (bitmap != null) bitmap.recycle();
        }
    }

    /** detectAndClassify({ data: base64 JPEG/PNG }) →
     *  { detections: [{ box: {x1, y1, x2, y2} (fractions of the
     *  original photo, pre-margin), container, containerScore,
     *  candidates: [{label, score}] (v11 top-3 for the crop) }] }
     *  Detector-first flow; empty detections means "no container
     *  found" (the web layer then falls back to classify()). */
    @PluginMethod
    public void detectAndClassify(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Offline scan: no image data provided.");
            return;
        }
        Bitmap bitmap = null;
        Bitmap detScaled = null;
        try {
            bitmap = decodePhoto(data);
            if (bitmap == null) {
                call.reject("Offline scan: could not decode the photo.");
                return;
            }
            int origW = bitmap.getWidth();
            int origH = bitmap.getHeight();

            // Detector input: stretch to 416x416, BGR, normalize.
            detScaled = Bitmap.createScaledBitmap(bitmap, DETECTOR_INPUT_SIZE, DETECTOR_INPUT_SIZE, true);
            ByteBuffer detInput = ByteBuffer.allocateDirect(
                DETECTOR_INPUT_SIZE * DETECTOR_INPUT_SIZE * 3 * 4);
            detInput.order(ByteOrder.nativeOrder());
            int[] pixels = new int[DETECTOR_INPUT_SIZE * DETECTOR_INPUT_SIZE];
            detScaled.getPixels(pixels, 0, DETECTOR_INPUT_SIZE, 0, 0,
                DETECTOR_INPUT_SIZE, DETECTOR_INPUT_SIZE);
            for (int pixel : pixels) {
                int r = (pixel >> 16) & 0xFF;
                int g = (pixel >> 8) & 0xFF;
                int b = pixel & 0xFF;
                // BGR channel order, matching the val pipeline.
                detInput.putFloat((b - DETECTOR_MEAN[0]) / DETECTOR_STD[0]);
                detInput.putFloat((g - DETECTOR_MEAN[1]) / DETECTOR_STD[1]);
                detInput.putFloat((r - DETECTOR_MEAN[2]) / DETECTOR_STD[2]);
            }
            detInput.rewind();

            Interpreter detInterp = getDetectorInterpreter();
            Tensor detOut = detInterp.getOutputTensor(0);
            int numAnchors = detOut.shape()[1];
            float[][][] detOutput = new float[1][numAnchors][DETECTOR_CHANNELS];
            detInterp.run(detInput, detOutput);

            List<Detection> detections = decodeDetections(detOutput[0], origW, origH);
            List<String> detLabelList = getDetectorLabels();

            JSArray out = new JSArray();
            for (Detection d : detections) {
                // Crop with margin, clamped; skip degenerate crops.
                float bw = d.x2 - d.x1;
                float bh = d.y2 - d.y1;
                int cx1 = Math.max(0, Math.round(d.x1 - CROP_MARGIN * bw));
                int cy1 = Math.max(0, Math.round(d.y1 - CROP_MARGIN * bh));
                int cx2 = Math.min(origW, Math.round(d.x2 + CROP_MARGIN * bw));
                int cy2 = Math.min(origH, Math.round(d.y2 + CROP_MARGIN * bh));
                if (cx2 - cx1 < 16 || cy2 - cy1 < 16) continue;
                Bitmap crop = Bitmap.createBitmap(bitmap, cx1, cy1, cx2 - cx1, cy2 - cy1);
                JSArray candidates;
                try {
                    candidates = classifyBitmap(crop);
                } finally {
                    crop.recycle();
                }
                JSObject entry = new JSObject();
                JSObject box = new JSObject();
                box.put("x1", d.x1 / origW);
                box.put("y1", d.y1 / origH);
                box.put("x2", d.x2 / origW);
                box.put("y2", d.y2 / origH);
                entry.put("box", box);
                entry.put("container", d.classIndex < detLabelList.size()
                    ? detLabelList.get(d.classIndex) : ("container_" + d.classIndex));
                entry.put("containerScore", d.score);
                entry.put("candidates", candidates);
                out.put(entry);
            }

            JSObject result = new JSObject();
            result.put("detections", out);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Offline scan failed: " + e.getMessage());
        } finally {
            if (detScaled != null && detScaled != bitmap) detScaled.recycle();
            if (bitmap != null) bitmap.recycle();
        }
    }

    @Override
    public void handleOnDestroy() {
        synchronized (this) {
            if (classifierInterpreter != null) {
                classifierInterpreter.close();
                classifierInterpreter = null;
            }
            if (detectorInterpreter != null) {
                detectorInterpreter.close();
                detectorInterpreter = null;
            }
        }
        super.handleOnDestroy();
    }
}
