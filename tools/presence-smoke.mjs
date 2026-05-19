// Two-client presence smoke test for Phase 5.
//   node tools/presence-smoke.mjs <aliceToken> <bobToken>
//
// Connects: Alice tab 1, Bob, Alice tab 2, then disconnects each in turn.
// Expects: Alice's tab-1 sees Bob online/offline, but never sees herself
// flip offline when her own tab 2 closes (last-socket semantics).
import { io } from "socket.io-client";

const ALICE_TOKEN = process.argv[2];
const BOB_TOKEN = process.argv[3];
if (!(ALICE_TOKEN && BOB_TOKEN)) {
  console.error("usage: node tools/presence-smoke.mjs <aliceToken> <bobToken>");
  process.exit(1);
}

function client(_name, token) {
  return io("http://localhost:3000", {
    transports: ["websocket"],
    auth: { token },
  });
}

const log = (who, msg, data = "") => console.log(`[${who}] ${msg}`, data);

const alice1 = client("alice-tab-1", ALICE_TOKEN);
const events = [];

alice1.on("connect", () => log("alice-tab-1", "connected", alice1.id));
alice1.on("user:online", (p) => events.push({ saw: "user:online", ...p }));
alice1.on("user:offline", (p) => events.push({ saw: "user:offline", ...p }));

setTimeout(() => {
  log("---", "connecting Bob");
  const bob = client("bob", BOB_TOKEN);
  bob.on("connect", () => log("bob", "connected", bob.id));

  setTimeout(() => {
    log("---", "opening Alice tab #2");
    const alice2 = client("alice-tab-2", ALICE_TOKEN);
    alice2.on("connect", () => log("alice-tab-2", "connected", alice2.id));

    setTimeout(() => {
      log("---", "closing Alice tab #2 (should NOT flip Alice offline)");
      alice2.disconnect();

      setTimeout(() => {
        log("---", "disconnecting Bob");
        bob.disconnect();

        setTimeout(() => {
          log("---", "closing Alice tab #1");
          alice1.disconnect();

          setTimeout(() => {
            console.log(
              "\n=== events Alice saw (should be Bob online + Bob offline, never herself) ==="
            );
            console.log(JSON.stringify(events, null, 2));
            process.exit(0);
          }, 500);
        }, 500);
      }, 500);
    }, 800);
  }, 800);
}, 800);
