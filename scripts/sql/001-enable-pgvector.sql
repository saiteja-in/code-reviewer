-- Step 2: enable pgvector for FileChunk embeddings (Step 3+ schema).
-- Safe to run multiple times.
CREATE EXTENSION IF NOT EXISTS vector;
