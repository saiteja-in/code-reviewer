// =============================================================================
// Neo4j graph schema bootstrap — Step 4
// Run once against a fresh Neo4j instance (idempotent: safe to re-run).
//
// Node labels: File, Class, Interface, Method, Field
// Shared properties: id (unique), repoId, name, path, startLine, endLine, language
// Optional (M3+): scipSymbol, hash (incremental indexing)
//
// Relationship types (created in Steps 16–18):
//   M2: CONTAINS, DECLARES
//   M3: CALLS, EXTENDS, IMPLEMENTS, HAS_TYPE, RETURNS, OVERRIDES
// =============================================================================

// --- Uniqueness constraints (node id is globally unique within the graph) ---

CREATE CONSTRAINT file_id IF NOT EXISTS
FOR (n:File) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT class_id IF NOT EXISTS
FOR (n:Class) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT interface_id IF NOT EXISTS
FOR (n:Interface) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT method_id IF NOT EXISTS
FOR (n:Method) REQUIRE n.id IS UNIQUE;

CREATE CONSTRAINT field_id IF NOT EXISTS
FOR (n:Field) REQUIRE n.id IS UNIQUE;

// --- repoId indexes (every query MUST filter by repoId) ---

CREATE INDEX file_repo IF NOT EXISTS
FOR (n:File) ON (n.repoId);

CREATE INDEX class_repo IF NOT EXISTS
FOR (n:Class) ON (n.repoId);

CREATE INDEX interface_repo IF NOT EXISTS
FOR (n:Interface) ON (n.repoId);

CREATE INDEX method_repo IF NOT EXISTS
FOR (n:Method) ON (n.repoId);

CREATE INDEX field_repo IF NOT EXISTS
FOR (n:Field) ON (n.repoId);

// --- Lookup indexes ---

CREATE INDEX file_path IF NOT EXISTS
FOR (n:File) ON (n.path);

CREATE INDEX method_name IF NOT EXISTS
FOR (n:Method) ON (n.name);

CREATE INDEX class_name IF NOT EXISTS
FOR (n:Class) ON (n.name);

CREATE INDEX method_repo_name IF NOT EXISTS
FOR (n:Method) ON (n.repoId, n.name);

CREATE INDEX file_repo_path IF NOT EXISTS
FOR (n:File) ON (n.repoId, n.path);

// --- M3+ optional property indexes ---

CREATE INDEX method_scip_symbol IF NOT EXISTS
FOR (n:Method) ON (n.scipSymbol);

CREATE INDEX file_hash IF NOT EXISTS
FOR (n:File) ON (n.hash);
