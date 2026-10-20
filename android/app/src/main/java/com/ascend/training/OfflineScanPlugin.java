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
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.List;

/**
 * On-device food recognition for the meal scanner (v1 model).
 *
 * Loads the bundled INT8 TFLite classifier from assets
 * (models/indian_food_cls_int8.tflite + models/labels.txt — interim
 * bundling; Play Asset Delivery is the documented later step) and runs
 * it entirely on-device: no network, no photo ever leaves the phone.
 *
 * Model contract (verified against the trained artifact):
 *   input  [1, 256, 256, 3] UINT8 raw NHWC pixels — normalization is
 *          folded into the model, so feed raw 0–255 bytes, no scaling.
 *   output [1, N] UINT8 quantized logits — dequantize with the output
 *          tensor's (scale, zeroPoint), then softmax.
 *
 * Written in Java to follow the AppSettingsPlugin precedent exactly:
 * the app module has no Kotlin Gradle plugin wired, and this class must
 * compile under the existing build with zero new build config beyond
 * the tensorflow-lite dependency in app/build.gradle.
 *
 * Every failure path rejects/resolves cleanly — a bad photo or a model
 * that cannot load must never crash the bridge; the web layer falls
 * back to the server AI scan.
 */
@CapacitorPlugin(name = "OfflineScan")
public class OfflineScanPlugin extends Plugin {

    private static final String MODEL_ASSET = "models/indian_food_cls_int8.tflite";
    private static final String LABELS_ASSET = "models/labels.txt";
    private static final int INPUT_SIZE = 256;
    private static final int TOP_K = 3;

    private Interpreter interpreter;
    private List<String> labels;

    // ── Model loading (lazy, once) ───────────────────────────────────

    private synchronized Interpreter getInterpreter() throws IOException {
        if (interpreter == null) {
            Interpreter.Options options = new Interpreter.Options();
            options.setNumThreads(4);
            options.setUseXNNPACK(true);
            interpreter = new Interpreter(loadModelBuffer(), options);
        }
        return interpreter;
    }

    private synchronized List<String> getLabels() throws IOException {
        if (labels == null) {
            labels = new ArrayList<>();
            InputStream in = getContext().getAssets().open(LABELS_ASSET);
            BufferedReader reader = new BufferedReader(new InputStreamReader(in));
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (!trimmed.isEmpty()) labels.add(trimmed);
            }
            reader.close();
        }
        return labels;
    }

    /** Memory-map the model out of assets (kept uncompressed via
     *  aaptOptions noCompress 'tflite'); falls back to a direct buffer
     *  copy if mapping is unavailable for any reason. */
    private ByteBuffer loadModelBuffer() throws IOException {
        AssetManager assets = getContext().getAssets();
        try {
            AssetFileDescriptor fd = assets.openFd(MODEL_ASSET);
            FileInputStream inputStream = new FileInputStream(fd.getFileDescriptor());
            FileChannel fileChannel = inputStream.getChannel();
            MappedByteBuffer mapped = fileChannel.map(
                FileChannel.MapMode.READ_ONLY, fd.getStartOffset(), fd.getDeclaredLength());
            inputStream.close();
            fd.close();
            return mapped;
        } catch (IOException | RuntimeException e) {
            InputStream in = assets.open(MODEL_ASSET);
            byte[] bytes = new byte[in.available()];
            int read = 0;
            while (read < bytes.length) {
                int n = in.read(bytes, read, bytes.length - read);
                if (n < 0) break;
                read += n;
            }
            in.close();
            ByteBuffer buffer = ByteBuffer.allocateDirect(bytes.length);
            buffer.order(ByteOrder.nativeOrder());
            buffer.put(bytes, 0, read);
            buffer.rewind();
            return buffer;
        }
    }

    // ── Bridge methods ───────────────────────────────────────────────

    /** { available: boolean, labels: number } — resolves (never
     *  rejects) so the web layer can treat any failure as "offline
     *  scan unavailable" and keep the server flow. */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        try {
            getInterpreter();
            result.put("available", true);
            result.put("labels", getLabels().size());
        } catch (Exception e) {
            result.put("available", false);
            result.put("labels", 0);
        }
        call.resolve(result);
    }

    /** classify({ data: base64 JPEG/PNG }) → { results: [{label, score}] }
     *  Top-3 by softmax probability over the dequantized logits. */
    @PluginMethod
    public void classify(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Offline scan: no image data provided.");
            return;
        }
        // Tolerate a data-URL prefix even though the web layer strips it.
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) {
            data = data.substring(comma + 1);
        }

        Bitmap bitmap = null;
        Bitmap scaled = null;
        try {
            byte[] imageBytes = Base64.decode(data, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
            if (bitmap == null) {
                call.reject("Offline scan: could not decode the photo.");
                return;
            }
            scaled = Bitmap.createScaledBitmap(bitmap, INPUT_SIZE, INPUT_SIZE, true);

            ByteBuffer input = ByteBuffer.allocateDirect(INPUT_SIZE * INPUT_SIZE * 3);
            input.order(ByteOrder.nativeOrder());
            int[] pixels = new int[INPUT_SIZE * INPUT_SIZE];
            scaled.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE);
            for (int pixel : pixels) {
                input.put((byte) ((pixel >> 16) & 0xFF)); // R
                input.put((byte) ((pixel >> 8) & 0xFF));  // G
                input.put((byte) (pixel & 0xFF));         // B
            }
            input.rewind();

            Interpreter interp = getInterpreter();
            Tensor outputTensor = interp.getOutputTensor(0);
            int numClasses = outputTensor.shape()[1];
            byte[][] output = new byte[1][numClasses];
            interp.run(input, output);

            Tensor.QuantizationParams qp = outputTensor.quantizationParams();
            float scale = qp.getScale();
            int zeroPoint = qp.getZeroPoint();

            // Dequantize → softmax (max-subtracted for stability).
            float[] probs = new float[numClasses];
            float max = Float.NEGATIVE_INFINITY;
            for (int i = 0; i < numClasses; i++) {
                // Java bytes are signed; the tensor is UINT8 — mask first.
                probs[i] = ((output[0][i] & 0xFF) - zeroPoint) * scale;
                if (probs[i] > max) max = probs[i];
            }
            float sum = 0f;
            for (int i = 0; i < numClasses; i++) {
                probs[i] = (float) Math.exp(probs[i] - max);
                sum += probs[i];
            }
            if (sum > 0f) {
                for (int i = 0; i < numClasses; i++) probs[i] /= sum;
            }

            List<Integer> order = new ArrayList<>();
            for (int i = 0; i < numClasses; i++) order.add(i);
            order.sort((a, b) -> Float.compare(probs[b], probs[a]));

            List<String> labelList = getLabels();
            JSArray results = new JSArray();
            int limit = Math.min(TOP_K, numClasses);
            for (int rank = 0; rank < limit; rank++) {
                int idx = order.get(rank);
                JSObject entry = new JSObject();
                entry.put("label", idx < labelList.size() ? labelList.get(idx) : ("class_" + idx));
                entry.put("score", probs[idx]);
                results.put(entry);
            }

            JSObject result = new JSObject();
            result.put("results", results);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Offline scan failed: " + e.getMessage());
        } finally {
            if (scaled != null && scaled != bitmap) scaled.recycle();
            if (bitmap != null) bitmap.recycle();
        }
    }

    @Override
    public void handleOnDestroy() {
        synchronized (this) {
            if (interpreter != null) {
                interpreter.close();
                interpreter = null;
            }
        }
        super.handleOnDestroy();
    }
}
