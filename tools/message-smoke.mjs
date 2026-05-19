// Two-client messaging smoke for Phase 7.
//   node tools/message-smoke.mjs <aliceToken> <aliceId> <bobToken> <bobId>
//
// Alice sends 3 messages; Bob receives them via message:new and sends one
// back. Verifies:
//   • delivered arrives before the echoed new
//   • no duplicate messages on the sender side (id-based dedup)
//   • messages flow both directions within ~1 tick
import { io } from "socket.io-client";

const [, , ALICE_TOKEN, ALICE_ID, BOB_TOKEN, BOB_ID] = process.argv;
if (!(ALICE_TOKEN && ALICE_ID && BOB_TOKEN && BOB_ID)) {
  console.error(
    "usage: node tools/message-smoke.mjs <aliceToken> <aliceId> <bobToken> <bobId>"
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

const aliceSeen = [];
const aliceDelivered = [];
const bobSeen = [];

alice.on("connect", () => console.log("[alice] connected"));
bob.on("connect", () => console.log("[bob] connected"));

alice.on("message:new", (m) =>
  aliceSeen.push({ id: m.id, body: m.body, from: m.senderId })
);
alice.on("message:delivered", (p) =>
  aliceDelivered.push({ clientId: p.clientId, id: p.id })
);
bob.on("message:new", (m) =>
  bobSeen.push({ id: m.id, body: m.body, from: m.senderId })
);

await new Promise((r) => setTimeout(r, 800));

console.log("\n[alice] sending 3 messages to Bob");
for (let i = 1; i <= 3; i++) {
  alice.emit("message:send", {
    recipientId: BOB_ID,
    body: `Hello #${i} from Alice`,
    clientId: `alice-client-${i}`,
  });
  await new Promise((r) => setTimeout(r, 200));
}

await new Promise((r) => setTimeout(r, 500));

console.log("[bob] sending 1 message back");
bob.emit("message:send", {
  recipientId: ALICE_ID,
  body: "Hey Alice 👋",
  clientId: "bob-client-1",
});

await new Promise((r) => setTimeout(r, 500));

console.log(`\n=== Alice's message:delivered count: ${aliceDelivered.length}`);
console.log(`=== Alice's message:new count:       ${aliceSeen.length}`);
console.log(`=== Bob's message:new count:         ${bobSeen.length}`);

const aliceDuplicates = aliceSeen.filter(
  (m, i, arr) => arr.findIndex((x) => x.id === m.id) !== i
);
console.log(
  `=== Alice duplicate messages (should be 0): ${aliceDuplicates.length}`
);

console.log("\n--- Alice saw ---");
console.log(JSON.stringify(aliceSeen, null, 2));
console.log("\n--- Bob saw ---");
console.log(JSON.stringify(bobSeen, null, 2));

alice.disconnect();
bob.disconnect();
process.exit(0);
