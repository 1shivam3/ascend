/**
 * ASCEND Form Coach — Canvas Pose & Skeleton Overlay
 *
 * Renders smooth joint landmarks, connection lines, joint angle arcs,
 * and framing guides aligned with the live video feed.
 */

import React, { useEffect, useRef } from 'react';
import { NormalizedLandmark, POSE_CONNECTIONS, PoseLandmarkIndex, DetectedSide } from '../models/pose.types';

export interface VideoContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The rectangle the video PICTURE actually occupies inside its element
 * under `object-fit: contain` (letterbox/pillarbox math). Deep audit D5b:
 * the overlay canvas used to be stretched over the whole container with
 * `object-cover` while the <video> used `object-contain` — for a portrait
 * phone video in the landscape player the skeleton rendered ~3x too
 * tall, cropped, and shifted onto the black pillarbox, matching no
 * person in the frame (owner screenshot, 2026-11-05). The canvas element
 * is now positioned over exactly this rect, and its bitmap stays at the
 * video's native resolution, so normalized landmark coordinates map 1:1.
 */
export function computeVideoContentRect(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number
): VideoContentRect {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return { left: 0, top: 0, width: Math.max(0, containerWidth), height: Math.max(0, containerHeight) };
  }
  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

interface PoseOverlayProps {
  landmarksRef: React.MutableRefObject<NormalizedLandmark[] | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  detectedSide: DetectedSide;
  isReady: boolean;
  currentKneeAngleDeg: number | null;
}

export default function PoseOverlay({
  landmarksRef,
  videoRef,
  detectedSide,
  isReady,
  currentKneeAngleDeg,
}: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;

      if (canvas && video && video.videoWidth > 0 && video.videoHeight > 0) {
        // Match canvas dimensions to video element
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        // Position the canvas ELEMENT over the video's actual picture
        // rect (object-contain letterboxing) — not the whole container.
        // The bitmap stays at native video resolution, so the drawing
        // coordinates below are unaffected. (D5b)
        const parent = canvas.parentElement;
        if (parent) {
          const rect = computeVideoContentRect(
            parent.clientWidth,
            parent.clientHeight,
            video.videoWidth,
            video.videoHeight
          );
          const style = canvas.style;
          const next = {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          };
          if (
            style.left !== next.left ||
            style.top !== next.top ||
            style.width !== next.width ||
            style.height !== next.height
          ) {
            style.left = next.left;
            style.top = next.top;
            style.width = next.width;
            style.height = next.height;
          }
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const landmarks = landmarksRef.current;
          if (landmarks && landmarks.length >= 33) {
            // Pick styling based on tracking confidence
            const strokeColor = isReady ? 'rgba(56, 189, 248, 0.85)' : 'rgba(234, 179, 8, 0.75)'; // sky-400 or yellow-500
            const jointColor = isReady ? '#38bdf8' : '#eab308';

            // Draw skeleton connection lines
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = strokeColor;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            for (const [idxA, idxB] of POSE_CONNECTIONS) {
              const lmA = landmarks[idxA];
              const lmB = landmarks[idxB];

              const visA = lmA?.visibility ?? 1.0;
              const visB = lmB?.visibility ?? 1.0;

              if (visA >= 0.5 && visB >= 0.5) {
                ctx.beginPath();
                ctx.moveTo(lmA.x * canvas.width, lmA.y * canvas.height);
                ctx.lineTo(lmB.x * canvas.width, lmB.y * canvas.height);
                ctx.stroke();
              }
            }

            // Draw joints
            for (let i = 0; i < landmarks.length; i++) {
              const lm = landmarks[i];
              const vis = lm?.visibility ?? 1.0;

              if (vis >= 0.5) {
                // Highlight primary squat joints (knees, hips, ankles)
                const isSquatJoint =
                  i === PoseLandmarkIndex.LEFT_KNEE ||
                  i === PoseLandmarkIndex.RIGHT_KNEE ||
                  i === PoseLandmarkIndex.LEFT_HIP ||
                  i === PoseLandmarkIndex.RIGHT_HIP ||
                  i === PoseLandmarkIndex.LEFT_ANKLE ||
                  i === PoseLandmarkIndex.RIGHT_ANKLE;

                const radius = isSquatJoint ? 5.5 : 3.5;

                ctx.beginPath();
                ctx.arc(lm.x * canvas.width, lm.y * canvas.height, radius, 0, 2 * Math.PI);
                ctx.fillStyle = isSquatJoint ? '#ffffff' : jointColor;
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = strokeColor;
                ctx.stroke();
              }
            }

            // Display Knee Angle Arc & Badge if available
            if (currentKneeAngleDeg !== null) {
              const kneeIdx = detectedSide === 'right' ? PoseLandmarkIndex.RIGHT_KNEE : PoseLandmarkIndex.LEFT_KNEE;
              const knee = landmarks[kneeIdx];
              if (knee && (knee.visibility ?? 1.0) >= 0.5) {
                const kx = knee.x * canvas.width;
                const ky = knee.y * canvas.height;

                // Angle text badge
                ctx.save();
                ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
                const text = `${Math.round(currentKneeAngleDeg)}°`;
                const textMetrics = ctx.measureText(text);
                const padding = 6;
                const badgeWidth = textMetrics.width + padding * 2;
                const badgeHeight = 22;

                ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
                ctx.beginPath();
                ctx.roundRect(kx + 12, ky - 11, badgeWidth, badgeHeight, 6);
                ctx.fill();

                ctx.fillStyle = '#38bdf8';
                ctx.fillText(text, kx + 12 + padding, ky + 5);
                ctx.restore();
              }
            }
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [landmarksRef, videoRef, detectedSide, isReady, currentKneeAngleDeg]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute pointer-events-none z-10"
      aria-hidden="true"
    />
  );
}
