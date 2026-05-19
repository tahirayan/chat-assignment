#!/usr/bin/env node
/**
 * Module-boundary enforcement for the Chat monorepo.
 *
 * Biome's `noRestrictedImports` catches violations *inside files*, but it does
 * not see the Nx project graph. This script reads `nx graph --file=…` and
 * fails CI if any project dependency violates the rules below.
 *
 * Rules (matches the tags declared in each project.json):
 *
 *   scope:web         ─ may depend on scope:shared only
 *   scope:api         ─ may depend on scope:shared only
 *   scope:shared      ─ may depend on scope:shared only (no app deps)
 *   type:types        ─ may depend on type:types only
 *   type:contracts    ─ may depend on type:types and type:contracts
 *
 * Run via:  node tools/check-boundaries.mjs  (or  pnpm boundaries)
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const GRAPH_FILE = resolve(REPO_ROOT, ".nx-graph.json");

function generateGraph() {
  const result = spawnSync(
    "pnpm",
    ["exec", "nx", "graph", "--file=.nx-graph.json"],
    { cwd: REPO_ROOT, stdio: "inherit", shell: true }
  );
  if (result.status !== 0) {
    console.error("Failed to generate nx graph");
    process.exit(1);
  }
}

function loadGraph() {
  if (!existsSync(GRAPH_FILE)) {
    generateGraph();
  }
  const raw = readFileSync(GRAPH_FILE, "utf-8");
  return JSON.parse(raw);
}

function tagsOf(graph, project) {
  return graph.graph.nodes[project]?.data?.tags ?? [];
}

function isApp(tags) {
  return tags.includes("scope:web") || tags.includes("scope:api");
}

function violatesScope(sourceTags, targetTags, sourceName, targetName) {
  // scope:web ↔ scope:api — never allowed
  if (sourceTags.includes("scope:web") && targetTags.includes("scope:api")) {
    return `${sourceName} → ${targetName} (scope:web cannot depend on scope:api)`;
  }
  if (sourceTags.includes("scope:api") && targetTags.includes("scope:web")) {
    return `${sourceName} → ${targetName} (scope:api cannot depend on scope:web)`;
  }
  // scope:shared cannot depend on apps
  if (sourceTags.includes("scope:shared") && isApp(targetTags)) {
    return `${sourceName} → ${targetName} (scope:shared cannot depend on an app)`;
  }
  return null;
}

function violatesType(sourceTags, targetTags, sourceName, targetName) {
  // type:types cannot depend on type:contracts (one-way contracts → types)
  if (
    sourceTags.includes("type:types") &&
    targetTags.includes("type:contracts")
  ) {
    return `${sourceName} → ${targetName} (type:types cannot depend on type:contracts — reversed dependency)`;
  }
  return null;
}

function checkBoundaries(graph) {
  const violations = [];
  const dependencies = graph.graph.dependencies ?? {};

  for (const [source, deps] of Object.entries(dependencies)) {
    const sourceTags = tagsOf(graph, source);
    for (const dep of deps) {
      // Skip implicit / dynamic deps without a target node in the graph
      if (!graph.graph.nodes[dep.target]) {
        continue;
      }
      const targetTags = tagsOf(graph, dep.target);
      const scopeViolation = violatesScope(
        sourceTags,
        targetTags,
        source,
        dep.target
      );
      if (scopeViolation) {
        violations.push(scopeViolation);
      }
      const typeViolation = violatesType(
        sourceTags,
        targetTags,
        source,
        dep.target
      );
      if (typeViolation) {
        violations.push(typeViolation);
      }
    }
  }

  if (violations.length > 0) {
    console.error("\n✗ Module-boundary violations:\n");
    for (const v of violations) {
      console.error(`  ${v}`);
    }
    console.error("");
    process.exit(1);
  }

  const projectCount = Object.keys(graph.graph.nodes).length;
  console.log(`✓ Boundaries OK — ${projectCount} projects checked.`);
}

const graph = loadGraph();
checkBoundaries(graph);
