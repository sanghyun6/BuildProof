import type { Evidence, RepoScan } from "../types/pipeline";
import {
  findMatchingDependency,
  findMatchingPythonDep,
  matchingFilePaths,
  readmeMatchingTerms,
  sourceMatchingTerms,
  makeEvidence,
} from "./scan";

const CV_DEPS = [
  "opencv",
  "opencv-python",
  "opencv-python-headless",
  "mediapipe",
  "tensorflow",
  "tf-nightly",
  "@tensorflow/tfjs",
  "@tensorflow/tfjs-node",
  "@tensorflow-models/coco-ssd",
  "@tensorflow-models/pose-detection",
  "@tensorflow-models/face-detection",
  "torch",
  "torchvision",
  "ultralytics",
  "tesseract",
  "pytesseract",
  "tesseract.js",
  "face-api.js",
  "tracking",
  "onnxruntime",
  "onnxruntime-node",
  "onnxruntime-web",
  "roboflow",
  "replicate",
  "clarifai",
  "google-cloud-vision",
  "@google-cloud/vision",
];

// Python package names not already covered above
const CV_PYTHON_EXTRA_DEPS = [
  "pillow",
  "Pillow",
  "scikit-image",
  "supervision",
  "detectron2",
  "paddlepaddle",
  "paddleocr",
  "easyocr",
  "keras",
  "timm",
  "albumentations",
  "imageai",
];

const CV_FILE_PATTERNS = [
  "vision",
  "video",
  "camera",
  "frame",
  "ocr",
  "detect",
  "pose",
  "image",
  "classify",
  "segment",
  "yolo",
  "opencv",
];

const CV_README_TERMS = [
  "computer vision",
  "object detection",
  "image recognition",
  "pose estimation",
  "ocr",
  "frame analysis",
  "video processing",
  "yolo",
  "opencv",
  "mediapipe",
  "tesseract",
  "face detection",
  "image classification",
  "semantic segmentation",
  "instance segmentation",
];

const CV_SOURCE_TERMS = [
  "cv2",
  "opencv",
  "OpenCV",
  "mediapipe",
  "MediaPipe",
  "tensorflow",
  "tf.image",
  "torch.nn",
  "torchvision",
  "YOLO",
  "ultralytics",
  "tesseract",
  "Tesseract",
  "faceapi",
  "face_recognition",
  "VideoCapture",
  "imread",
  "imshow",
  "detectAllFaces",
  "getPoseLandmarks",
  "onnxruntime",
  "InferenceSession",
];

export function detectComputerVision(scan: RepoScan): Evidence[] {
  const positive: Evidence[] = [];

  const foundNodeDep = findMatchingDependency(scan, CV_DEPS);
  if (foundNodeDep) {
    positive.push(makeEvidence(`package.json includes ${foundNodeDep}`, "package_json", true));
  } else {
    const foundPyDep = findMatchingPythonDep(scan, [...CV_DEPS, ...CV_PYTHON_EXTRA_DEPS]);
    if (foundPyDep) {
      positive.push(
        makeEvidence(`${foundPyDep.file} includes ${foundPyDep.name}`, "package_json", true)
      );
    }
  }

  const cvFiles = matchingFilePaths(scan.fileTree, CV_FILE_PATTERNS);
  for (const path of cvFiles.slice(0, 3)) {
    positive.push(
      makeEvidence(`${path} suggests computer vision implementation`, "file_tree", true)
    );
  }

  const readmeHits = readmeMatchingTerms(scan.readmeText, CV_README_TERMS);
  if (readmeHits.length > 0) {
    positive.push(makeEvidence(`README mentions "${readmeHits[0]}"`, "readme", true));
  }

  const srcHits = sourceMatchingTerms(scan.sourceFiles, CV_SOURCE_TERMS);
  for (const hit of srcHits.slice(0, 2)) {
    positive.push(
      makeEvidence(`${hit.path} contains CV pattern ("${hit.term}")`, "source_file", true)
    );
  }

  if (positive.length === 0) {
    return [makeEvidence("No implementation evidence found", "absence", false)];
  }

  const evidence: Evidence[] = [...positive];

  const hasDepEvidence = positive.some((e) => e.source === "package_json");
  const hasSourceEvidence = positive.some(
    (e) => e.source === "source_file" || e.source === "file_tree"
  );

  if (!hasDepEvidence) {
    evidence.push(
      makeEvidence(
        "No computer vision dependency found (opencv-python, mediapipe, torch, ultralytics, etc.)",
        "package_json",
        false
      )
    );
  }
  if (!hasSourceEvidence) {
    evidence.push(
      makeEvidence(
        "No image processing or model inference code found in source files",
        "absence",
        false
      )
    );
  }

  return evidence;
}
