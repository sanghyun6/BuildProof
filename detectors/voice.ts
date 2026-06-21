import type { Evidence, RepoScan } from "../types/pipeline";
import {
  findMatchingDependency,
  findMatchingPythonDep,
  hasDependency,
  matchingFilePaths,
  readmeMatchingTerms,
  sourceMatchingTerms,
  makeEvidence,
} from "./scan";

const VOICE_DEPS = [
  "@deepgram/sdk",
  "deepgram",
  "assemblyai",
  "@assemblyai/assemblyai",
  "elevenlabs",
  "@elevenlabs/elevenlabs-js",
  "microsoft-cognitiveservices-speech-sdk",
  "@azure/cognitiveservices-speech-sdk",
  "openai",
  "groq-sdk",
  "speechmatics",
  "rev-ai",
  "@soniox/soniox-node",
  "lmnt-node",
];

// Python package names for voice / audio (some have different names from Node.js equivalents)
const VOICE_PYTHON_EXTRA_DEPS = [
  "deepgram-sdk",
  "google-cloud-speech",
  "speechrecognition",
  "pyttsx3",
  "gtts",
  "azure-cognitiveservices-speech",
  "pyaudio",
  "sounddevice",
  "whisper",
  "openai-whisper",
  "faster-whisper",
  "bark",
  "TTS",
];

// openai is a broad dep — only count it if paired with voice signals in source/README
const BROAD_DEPS = ["openai", "groq-sdk"];

const VOICE_FILE_PATTERNS = [
  "audio",
  "voice",
  "speech",
  "microphone",
  "transcri",
  "whisper",
  "tts",
  "stt",
  "record",
];

const VOICE_README_TERMS = [
  "transcription",
  "speech-to-text",
  "text-to-speech",
  "microphone",
  "audio upload",
  "voice input",
  "text to speech",
  "speech to text",
  "tts",
  "stt",
  "whisper",
  "deepgram",
  "elevenlabs",
  "assemblyai",
  "voice cloning",
  "voice synthesis",
];

const VOICE_SOURCE_TERMS = [
  "transcriptions.create",
  "audio.transcriptions",
  "deepgram",
  "Deepgram",
  "assemblyai",
  "AssemblyAI",
  "elevenlabs",
  "ElevenLabs",
  "MediaRecorder",
  "getUserMedia",
  "AudioContext",
  "whisper",
  "Whisper",
  "speech_to_text",
  "speechToText",
  "text_to_speech",
  "textToSpeech",
  "synthesize",
  "AudioBuffer",
];

export function detectVoice(scan: RepoScan): Evidence[] {
  const positive: Evidence[] = [];

  // Check specific (non-broad) voice deps in Node.js
  const specificDeps = VOICE_DEPS.filter((d) => !BROAD_DEPS.includes(d));
  const foundNodeDep = findMatchingDependency(scan, specificDeps);
  if (foundNodeDep) {
    positive.push(makeEvidence(`package.json includes ${foundNodeDep}`, "package_json", true));
  } else {
    // Check Python dependency files
    const foundPyDep = findMatchingPythonDep(scan, [...specificDeps, ...VOICE_PYTHON_EXTRA_DEPS]);
    if (foundPyDep) {
      positive.push(
        makeEvidence(`${foundPyDep.file} includes ${foundPyDep.name}`, "package_json", true)
      );
    }
  }

  const voiceFiles = matchingFilePaths(scan.fileTree, VOICE_FILE_PATTERNS);
  for (const path of voiceFiles.slice(0, 3)) {
    positive.push(
      makeEvidence(`${path} suggests voice or audio implementation`, "file_tree", true)
    );
  }

  const readmeHits = readmeMatchingTerms(scan.readmeText, VOICE_README_TERMS);
  if (readmeHits.length > 0) {
    positive.push(makeEvidence(`README mentions "${readmeHits[0]}"`, "readme", true));
  }

  const srcHits = sourceMatchingTerms(scan.sourceFiles, VOICE_SOURCE_TERMS);
  for (const hit of srcHits.slice(0, 2)) {
    positive.push(
      makeEvidence(`${hit.path} contains voice/audio pattern ("${hit.term}")`, "source_file", true)
    );
  }

  // openai counts only when paired with voice signals in source or README
  const hasDepEvidence = positive.some((e) => e.source === "package_json");
  if (
    !hasDepEvidence &&
    hasDependency(scan.packageJson, "openai") &&
    (srcHits.length > 0 || readmeHits.length > 0)
  ) {
    positive.push(
      makeEvidence(
        "package.json includes openai (with voice usage signals in codebase)",
        "package_json",
        true
      )
    );
  }

  if (positive.length === 0) {
    return [makeEvidence("No implementation evidence found", "absence", false)];
  }

  const evidence: Evidence[] = [...positive];

  const hasDepEvidenceFinal = positive.some((e) => e.source === "package_json");
  const hasSourceEvidence = positive.some(
    (e) => e.source === "source_file" || e.source === "file_tree"
  );

  if (!hasDepEvidenceFinal) {
    evidence.push(
      makeEvidence(
        "No voice or audio dependency found (@deepgram/sdk, assemblyai, elevenlabs, deepgram-sdk, etc.)",
        "package_json",
        false
      )
    );
  }
  if (!hasSourceEvidence) {
    evidence.push(
      makeEvidence(
        "No audio processing or speech API usage found in source files",
        "absence",
        false
      )
    );
  }

  return evidence;
}
