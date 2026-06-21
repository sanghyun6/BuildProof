import type { Evidence, RepoScan } from "../types/pipeline";
import { findImplementationSignals } from "./implementationSignals";

const RAG_NODE_DEPS = [
  "@pinecone-database/pinecone",
  "pinecone",
  "chromadb",
  "weaviate-client",
  "faiss-node",
  "qdrant-client",
  "langchain",
  "@langchain/core",
  "@langchain/community",
  "@langchain/openai",
  "llamaindex",
  "llama-index",
  "pgvector",
  "vectordb",
  "@zilliz/milvus2-sdk-node",
  "@lancedb/lancedb",
];

const RAG_PYTHON_DEPS = [
  ...RAG_NODE_DEPS,
  "faiss-cpu",
  "faiss-gpu",
  "sentence-transformers",
  "pymilvus",
  "lancedb",
  "annoy",
  "voyager",
  "pinecone-client",
  "langchain-core",
  "langchain-community",
  "langchain-openai",
];

const RAG_FILE_PATH_PATTERNS = [
  "rag",
  "vector",
  "embed",
  "retriev",
  "chroma",
  "pinecone",
  "weaviate",
  "qdrant",
  "lancedb",
  "index_documents",
  "ingest",
];

const RAG_README_TERMS = [
  "retrieval-augmented generation",
  "retrieval augmented generation",
  "vector database",
  "vector db",
  "vector store",
  "embeddings",
  "vector search",
  "similarity search",
  "semantic search",
  "retriever",
];

const RAG_IMPORT_PACKAGES = [
  "pinecone",
  "@pinecone-database/pinecone",
  "chromadb",
  "weaviate",
  "weaviate-client",
  "qdrant_client",
  "qdrant-client",
  "faiss",
  "faiss-node",
  "lancedb",
  "llamaindex",
  "llama_index",
  "langchain",
  "langchain_core",
  "langchain_community",
  "langchain_openai",
  "@langchain/core",
  "@langchain/community",
  "@langchain/openai",
  "sentence_transformers",
];

const RAG_USAGE_PATTERNS = [
  "VectorStore",
  "vector_store",
  "vectorStore",
  "similarity_search",
  "similaritySearch",
  "as_retriever",
  "asRetriever",
  "from_documents",
  "fromDocuments",
  "embed_documents",
  "embed_query",
  "embedDocuments",
  "embedQuery",
  "OpenAIEmbeddings",
  "HuggingFaceEmbeddings",
  "RecursiveCharacterTextSplitter",
  "CharacterTextSplitter",
  "split_documents",
  "splitDocuments",
  "upsert(",
  ".query(",
  "PineconeStore",
  "Chroma(",
  "WeaviateStore",
  "QdrantClient",
  "VectorStoreIndex",
];

export function detectRag(scan: RepoScan): Evidence[] {
  const result = findImplementationSignals(scan, {
    label: "RAG",
    nodeDeps: RAG_NODE_DEPS,
    pythonDeps: RAG_PYTHON_DEPS,
    filePathPatterns: RAG_FILE_PATH_PATTERNS,
    readmeTerms: RAG_README_TERMS,
    importPackages: RAG_IMPORT_PACKAGES,
    usagePatterns: RAG_USAGE_PATTERNS,
    absenceMessages: {
      noDep:
        "No vector database or retrieval dependency found (pinecone, chromadb, weaviate, qdrant, faiss, lancedb, langchain, llamaindex, etc.)",
      noSource:
        "No embedding, vector-store, or retrieval code found in source files",
    },
  });
  return result.evidence;
}
