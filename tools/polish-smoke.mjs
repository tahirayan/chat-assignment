// Phase 9 polish smoke: read receipts + typing indicators.
//   node tools/polish-smoke.mjs <aliceToken> <aliceId> <bobToken> <bobId>
import { io } from "socket.io-client";

const [, , ALICE_TOKEN, ALICE_ID, BOB_TOKEN, BOB_ID] = process.argv;
if (!(ALICE_TOKEN && ALICE_ID && BOB_TOKEN && BOB_ID)) {
  console.error(
    "usage: node tools/polish-smoke.mjs <aliceToken> <aliceId> <bobToken> <bobId>"
  );
  process.exit(1);
}

function client(token) {
  return io("http://localhost:3000", {
    transports: ["websocket"],
    auth: { token },
  });
}

const alice = client(ALICE_TOKEN);
const bob = client(BOB_TOKEN);

const aliceTypingSeen = [];
const aliceReadSeen = [];
const bobTypingSeen = [];

alice.on("connect", () => console.log("[alice] connected"));
bob.on("connect", () => console.log("[bob] connected"));

alice.on("typing:start", (p) => aliceTypingSeen.push({ kind: "start", ...p }));
alice.on("typing:stop", (p) => aliceTypingSeen.push({ kind: "stop", ...p }));
alice.on("message:read", (p) => aliceReadSeen.push(p));

bob.on("typing:start", (p) => bobTypingSeen.push({ kind: "start", ...p }));
bob.on("typing:stop", (p) => bobTypingSeen.push({ kind: "stop", ...p }));

await new Promise((r) => setTimeout(r, 600));

// ─── 1. Alice types to Bob ──────────────────────────────────────────────
console.log("\n[alice] emits typing:start to Bob");
alice.emit("typing:start", { otherUserId: BOB_ID });
await new Promise((r) => setTimeout(r, 300));

console.log("[alice] emits typing:stop to Bob");
alice.emit("typing:stop", { otherUserId: BOB_ID });
await new Promise((r) => setTimeout(r, 300));

// ─── 2. Alice sends a message; Bob marks read ──────────────────────────
console.log("\n[alice] sends 1 message to Bob");
alice.emit("message:send", {
  recipientId: BOB_ID,
  body: "hi bob",
  clientId: "smoke-1",
});
await new Promise((r) => setTimeout(r, 400));

console.log("[bob] emits message:read for alice");
bob.emit("message:read", { otherUserId: ALICE_ID });
await new Promise((r) => setTimeout(r, 300));

// ─── Report ─────────────────────────────────────────────────────────────
console.log("\n=== Bob saw typing events (from Alice):");
console.log(JSON.stringify(bobTypingSeen, null, 2));
console.log("\n=== Alice saw message:read events (from Bob):");
console.log(JSON.stringify(aliceReadSeen, null, 2));
console.log(
  "\n=== Alice saw typing events (should be empty — own echoes not delivered):"
);
console.log(JSON.stringify(aliceTypingSeen, null, 2));

alice.disconnect();
bob.disconnect();
process.exit(0);
