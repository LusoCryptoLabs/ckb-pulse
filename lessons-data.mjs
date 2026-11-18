// Made by kb_build.py and kb_render (LusoCryptoLabs, outside the server) from one week of public commits; do not edit by hand.
// Each lesson was written by a model from the commits in its sources and is not verified by a test.
export const LESSONS = {
 "from": "2026-11-11",
 "to": "2026-11-18",
 "read": 300,
 "topics": [
  {
   "area": "Developer tooling",
   "summary": "This week's developer-tooling lessons are mostly about building reliable offline verification and debugging around CKB: ckb-debugger script groups, mock transactions, since/time-lock evaluation, devnet timing, and exact numeric encoding. A second cluster covers safely installing and packaging CKB ecosystem tools, including inconsistent release asset names and layouts, checksum verification, zip-slip protection and dependency pinning.",
   "lessons": [
    {
     "title": "Use BigInt for uint64 RPC quantities",
     "lesson": "CKB RPC fields such as capacity, max_cycles and max_block_cycles are uint64 hex strings, and Number silently rounds anything above 2^53. Convert them with BigInt after strict validation: digits only and below 1n<<64n. Then format the result as `0x${n.toString(16)}`.",
     "concepts": [
      "Data encoding (molecule, hex, bigints)"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "26c8ff5d05",
       "subject": "Unify cell editors and references with structured context controls and stable list identities"
      }
     ]
    },
    {
     "title": "Devnet commits need the proposal window",
     "lesson": "On a devnet a transaction you just sent is not committed after mining one block, because it must first pass the proposal window. Before asserting, mine blocks in a loop and re-read the cell state until it matches or a retry limit is reached.",
     "concepts": [
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "6fc513b339",
       "subject": "scenario: wait for the renewed deadline (proposal window) before asserting it"
      }
     ]
    },
    {
     "title": "ckb-debugger verifies one script group per run",
     "lesson": "`full` is a VM mode, and by default ckb-debugger runs only input 0's lock, which may be an always-success lock. To check a whole transaction, enumerate every input lock, input type and output type group, run each with --script-group-type/--cell-type/--cell-index, and sum the cycles. Pair each accepted case with a control that must fail with an exact error code.",
     "concepts": [
      "Testing and devnet",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "234509881c",
       "subject": "test: JS-built claims and returns accepted by the deployed contract binaries"
      }
     ]
    },
    {
     "title": "Witnesses do not follow reordered inputs",
     "lesson": "The witness at index i is read by the script group whose first input is at index i. If you reorder inputs, rebuild or re-sign the witnesses afterwards.",
     "concepts": [
      "Witnesses and signatures",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "476ad52aa5",
       "subject": "Explain missing header context and input witness positions"
      }
     ]
    },
    {
     "title": "Resolve Type ID script deps instead of hardcoding OutPoints",
     "lesson": "Testnet Omnilock sits behind Type ID and has been upgraded; its code cell is now 0xec18bf0d…5d4602:0x0 with data hash 0x6b29b6f1…8318fa. Hardcoded cell deps from old @ckb-ccc/core or lumos configs can point at spent cells. Resolve the dep through the type hash or upgrade the SDK.",
     "concepts": [
      "Cell deps and script lookup",
      "Type ID and upgrades"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "RetricSu/community-scripts",
       "hash": "6940789426",
       "subject": "chore: sync testnet omnilock and dob_0 deployments (#22)"
      }
     ]
    },
    {
     "title": "Timestamp since uses median time, which lags the tip",
     "lesson": "Timestamp-based since is checked against the median of the last 37 block timestamps, which trails the tip header's timestamp. Set deadlines to max(tip timestamp, median) + term + margin. On testnet there is no time travel, so real timelock tests must wait out the full term.",
     "concepts": [
      "Since and time locks",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "1798348a7f",
       "subject": "scripts/testnet-smoke.mjs: one-runner smoke test on testnet (create/arm, cancel, release recovery)"
      }
     ]
    },
    {
     "title": "Avoid JSON.parse round-trips on transaction JSON",
     "lesson": "Passing CKB transaction or verification JSON through JSON.parse and JSON.stringify silently rounds integers above MAX_SAFE_INTEGER and long decimals. Use a lossless parser, or forward the original string to the verifier (for example a WASM worker) rather than a parsed object.",
     "concepts": [
      "Data encoding (molecule, hex, bigints)"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "f572aed0c9",
       "subject": "Preserve JSON numeric precision and repair workbench controls"
      }
     ]
    },
    {
     "title": "Mock transactions must expand dep_group members",
     "lesson": "A ckb-debugger mock_info must include the dep_group cell and each of its member cells as code deps. Get the members by decoding the group's OutPointVec data: a u32 LE count, then for each entry a 32-byte hash and a u32 LE index.",
     "concepts": [
      "Testing and devnet",
      "Cell deps and script lookup",
      "Data encoding (molecule, hex, bigints)"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "b1ba07d485",
       "subject": "feat: dry-run-claims, the read-only tool that writes a ckb-debugger mock"
      }
     ]
    },
    {
     "title": "Identify script groups by type and hash",
     "lesson": "The same script can run as both a lock group and a type group, each with different input and output indices. Select groups by group_type plus script_hash (compared case-insensitively), never by hash alone. Only report indices when the engine result is ok and states its scope.",
     "concepts": [
      "Witnesses and signatures",
      "Other"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "dba4f30053",
       "subject": "Show verified script group membership"
      }
     ]
    },
    {
     "title": "Separate submit and commit verification environments",
     "lesson": "TxVerifyEnv::new_submit(tip) checks at tip+1+proposal_window.closest, so an absolute block since of tip+3 passes at submit but fails at commit. Take median time from env.parent_hash(), and use a commit candidate that is a verified child of the real tip. A relative since on an input without transaction_info is Immature before any header lookup.",
     "concepts": [
      "Since and time locks",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "ead067badf",
       "subject": "Expose caller-supplied offline consensus and true-tip verification contexts"
      }
     ]
    },
    {
     "title": "Journal signed transactions before broadcasting",
     "lesson": "For multi-transaction flows such as CKBFS segment appends, save each signed transaction's hash and bytes to a journal before sending. On retry, check getTransactionNoCache and rebroadcast the same bytes rather than rebuilding, so nothing is duplicated. Wait for each segment to commit before appending the next.",
     "concepts": [
      "Transaction building and fees",
      "Network and RPC reliability"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/html-jukebox",
       "hash": "226ee35af6",
       "subject": "feat: add a music mode with on-chain audio and a light show (#2)"
      }
     ]
    },
    {
     "title": "Mirror on-chain rules off-chain with mutation tests",
     "lesson": "Port the contract's witness decoder to JS with the same refusals: bad version, truncation, trailing bytes and max count. Before signing, run a checker that re-derives the on-chain rules from the finished transaction. Pin each rule with a mutation test that breaks exactly one field of a valid transaction and expects that specific reason.",
     "concepts": [
      "Testing and devnet",
      "Data encoding (molecule, hex, bigints)",
      "Since and time locks"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "330c212fcd",
       "subject": "test: JS settlement builders on the devnet, and a pre-signing checker"
      }
     ]
    },
    {
     "title": "Verify release checksums and fail closed",
     "lesson": "Hash downloaded CKB tool binaries with SHA-256 and compare against the GitHub asset `digest` (sha256:<hex>) or the published sums file. Delete the file on a mismatch and refuse to install when no checksum exists. Some ckb-standalone-debugger releases publish a PowerShell Get-FileHash table with uppercase hex, so accept both formats and compare case-insensitively.",
     "concepts": [
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "steven3002/ckbup",
       "hash": "8be044cd4f",
       "subject": "Verify SHA-256 against asset digests and published checksum files"
      }
     ]
    },
    {
     "title": "Guard archive extraction against zip-slip",
     "lesson": "When extracting tar.gz or zip releases, check each entry path component by component. Accept only Normal and CurDir components, reject `..` and root or drive prefixes, and skip symlink and hardlink entries.",
     "concepts": [
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "steven3002/ckbup",
       "hash": "d0e715af98",
       "subject": "Add safe tar.gz and zip extraction and binary lookup"
      }
     ]
    },
    {
     "title": "Pin the full dependency lock of vendored CCC bundles",
     "lesson": "Pinning CCC package versions alone is not enough. Commit an npm lock covering the bundler and all transitive dependencies, build with `npm ci`, and record the lock's sha256 in the bundle lock file. Tests should fail on lock drift, range versions or missing sha512 integrity.",
     "concepts": [
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "454068ae62",
       "subject": "chore: pin every input of the vendored wallet bundle"
      }
     ]
    },
    {
     "title": "Check ZK proof context against the assembled transaction",
     "lesson": "When a lock verifies a proof bound to a transaction-derived context, check before sending that the proof's public input equals the planned context. Also check that the assembled transaction hashes to that same context. Changes such as a swapped recipient leave size and fee unchanged, so only the hash comparison catches them.",
     "concepts": [
      "Transaction building and fees",
      "Witnesses and signatures",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "CECILIA-MULANDI/zk-Lock",
       "hash": "79d17c2fb4",
       "subject": "check bound unlock matches its context before sending (#25)"
      }
     ]
    },
    {
     "title": "Track Type ID upgrades when auditing catalogs",
     "lesson": "Compare docs, Explorer and SDK catalogs against the live successor cell's data and type hashes, not the baseline, so a catalog that already lists the upgraded tip is not flagged as a mismatch. Agreement between catalogs or with the successor does not authorize an upgrade. Check the consuming transaction against your own whitelist separately.",
     "concepts": [
      "Type ID and upgrades",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "RetricSu/community-scripts",
       "hash": "12909361c8",
       "subject": "fix(monitor): preserve full reports and improve alert grouping (#21)"
      }
     ]
    },
    {
     "title": "Do not duplicate header deps in verification contexts",
     "lesson": "A context that lists the same header twice is rejected with \"duplicate header\". Reuse an existing context header with a matching hash, and push to header_deps only when no case-insensitive match is already there.",
     "concepts": [
      "Transaction building and fees",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "156cfedfee",
       "subject": "Polish list controls and reuse matching header context"
      }
     ]
    },
    {
     "title": "Header dep extensions must be explicit in snapshots",
     "lesson": "A missing extension entry in a verification snapshot is not treated as having no extension. Give the extension bytes or an explicit null for every header dep block hash.",
     "concepts": [
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "476ad52aa5",
       "subject": "Explain missing header context and input witness positions"
      }
     ]
    },
    {
     "title": "Decoding InvalidDepGroup OutPoints",
     "lesson": "InvalidDepGroup prints the OutPoint in molecule encoding: a 32-byte tx_hash followed by a 4-byte little-endian index. Reverse the index bytes, then match only dep_group cell_deps on both tx_hash and index.",
     "concepts": [
      "Cell deps and script lookup",
      "Data encoding (molecule, hex, bigints)"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "9b881ea6dd",
       "subject": "Clarify header extension reuse and dependency errors"
      }
     ]
    },
    {
     "title": "Reset devnets instead of skewing the chain clock",
     "lesson": "Pushing devnet timestamps ahead leaves the chain clock skewed for every later run, which stalls services that compare the tip with wall time. Reset the devnet for each scenario. At the start, assert that |tip timestamp − now| is small, for example under 600 s.",
     "concepts": [
      "Testing and devnet",
      "Since and time locks"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "41facee756",
       "subject": "devnet: --reset for a fresh chain clock; scenario precondition instead of the start-up time jump; shorter accelerated wa"
      }
     ]
    },
    {
     "title": "Port CKB's sparse-merkle-tree byte for byte",
     "lesson": "nervosnetwork/sparse-merkle-tree folds runs of empty siblings into MergeWithZero nodes (merge byte 2; a normal merge uses byte 1 plus height and parent path), and bit 0 of a key is the low bit of byte 0. Compiled proofs use the opcodes 0x4c, 0x50, 0x51, 0x4f n (n=0 means 256) and 0x48. Test any off-chain port against vectors generated by the Rust code.",
     "concepts": [
      "Data encoding (molecule, hex, bigints)",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "b2681e9fe0",
       "subject": "feat: the paid set's sparse Merkle tree in JavaScript, pinned to Rust"
      }
     ]
    },
    {
     "title": "Profile spawned scripts with the right ELF symbols",
     "lesson": "In ckb-debugger full mode with spawn, coverage, flamegraph and overlap analysis now use the ELF of the VM chosen with --vm-id instead of the root program. Pass an unstripped binary with --vm-symbols to get symbols and debug info.",
     "concepts": [
      "Testing and devnet"
     ],
     "status": "current",
     "note": "Older ckb-debugger versions profile spawned children with the root program's symbols, so their profiles are wrong.",
     "sources": [
      {
       "repo": "nervosnetwork/ckb-standalone-debugger",
       "hash": "8cecb5dfac",
       "subject": "Support for VM symbols in full mode analysis (#210)"
      }
     ]
    },
    {
     "title": "Mock syscalls must write back output length",
     "lesson": "Emulated or fuzzed syscalls with an in/out length argument, such as pipe or fd-list syscalls, must store the actual number of items written to length_addr with store64. Otherwise the script reads a stale length.",
     "concepts": [
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/ckb-vm-contrib",
       "hash": "872b7a50ba",
       "subject": "fix: store written length in machine memory during syscall execution (#70)"
      }
     ]
    },
    {
     "title": "Release asset names differ per CKB tool",
     "lesson": "ckb, ckb-cli and ckb-debugger use `<tool>_<tag>_<triple>[-portable].<ext>`, while fnn and ckb-light-client use `<tool>_<tag>-<arch>-<os>[-portable].tar.gz`. ckb-debugger ships .tar.gz on every OS with a `<stem>-sha256.txt` and has no x86_64 macOS build, and ckb-cli ships .zip on macOS and Windows with no sums file. Try an ordered list of candidate names, including portable variants, against the release's actual asset list.",
     "concepts": [
      "Other"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "steven3002/ckbup",
       "hash": "c6cec9e80e",
       "subject": "Add ckb, fnn and ckb-light-client with naming schemes and build variants"
      },
      {
       "repo": "steven3002/ckbup",
       "hash": "090351a14a",
       "subject": "Add tool registry and asset naming for ckb-debugger and ckb-cli"
      }
     ]
    },
    {
     "title": "Handle wrapped and flat release archive layouts",
     "lesson": "ckb and ckb-cli archives wrap everything in one versioned top folder, while fnn, ckb-light-client and ckb-debugger are flat with config/ next to the binary. Strip a single top-level directory if that is all the archive contains, then require the binaries at the root.",
     "concepts": [
      "Other"
     ],
     "status": "current",
     "note": "Conflicting advice: c0239 suggests finding the binary by searching for its file name, while c0229 warns that a recursive search can pick the wrong file and lose sibling config files. Prefer c0229's root-check approach.",
     "sources": [
      {
       "repo": "steven3002/ckbup",
       "hash": "79b54731f7",
       "subject": "Find the package root of extracted archives"
      },
      {
       "repo": "steven3002/ckbup",
       "hash": "d0e715af98",
       "subject": "Add safe tar.gz and zip extraction and binary lookup"
      }
     ]
    },
    {
     "title": "Keep the whole Fiber release package",
     "lesson": "The fnn release ships fnn-cli and config/ alongside the binary, so install the whole extracted package rather than only the main binary. Do not put the ckb-cli bundled with the CKB release on PATH, so it does not shadow a separately managed ckb-cli.",
     "concepts": [
      "Other"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "steven3002/ckbup",
       "hash": "ea98bd2fee",
       "subject": "Keep whole release packages and put companion binaries on PATH"
      }
     ]
    },
    {
     "title": "Verify tsc output layout for packaged libraries",
     "lesson": "With rootDir \".\", tsc emits the entry to dist/src/index.js and does not copy vendored .mjs files, which breaks package.json main/exports and vendored imports. Add a post-build step that copies the vendored files and imports the built entry, so a broken package fails the build.",
     "concepts": [
      "Other"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "8572f1f837",
       "subject": "client: make dist/ importable (copy vendor, fix main/types/exports)"
      }
     ]
    }
   ]
  },
  {
   "area": "Fiber network",
   "summary": "This week's Fiber lessons centre on the move to V2-only channels: how to detect Channel V2 support, how to upgrade nodes and watchtower clients, and which RPC fields changed. The rest are channel-lifecycle correctness fixes covering TLC settlement on close and restart, MPP status, reestablish timeouts, funding checks and per-network script deployments.",
   "lessons": [
    {
     "title": "Per-network Fiber script deployment table",
     "lesson": "Do not reuse one FIBER_SCRIPTS list for testnet and mainnet. Mainnet FundingLock and CommitmentLock have different code_hash values, type_id args and ckb_auth cell_dep out_points. Keep one table keyed by network that matches fnn's config/{network}/config.yml, and generate every config (CLI templates, process manager, browser builder) from it.",
     "concepts": [
      "Cell deps and script lookup",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "RetricSu/fiber-pay",
       "hash": "73c7d6fe63",
       "subject": "chore: upgrade Fiber target to fnn v0.10.1 (#212)"
      }
     ]
    },
    {
     "title": "Fiber is V2-only: upgrade procedure and watchtower field",
     "lesson": "Current Fiber speaks only the V2 P2P and channel protocol, and it rejects V1 peers, legacy channels and old databases. Close channels with the old binary and start from an empty database before upgrading. Watchtower CreateWatchChannelParams.channel_features is now required and must be \"0x1\". Clients that omit it, or send the old commitment_contract_features, fail to deserialize.",
     "concepts": [
      "Channels and payments",
      "Other"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "acce5752af",
       "subject": "refactor!: remove V1 P2P and legacy channel support (#1746)"
      }
     ]
    },
    {
     "title": "Let open_channel decide Channel V2 support",
     "lesson": "Fiber (fnn ≥0.10) checks Channel V2 inside open_channel, using the peer's live Init/session features. Gossip graph_nodes features can be stale, and list_peers does not expose session features. Do not hard-block opens on a graph preflight; at most show a warning. Map only the exact errors \"CHANNEL_V2 is required\" and \"waiting for peer to send Init\", not loose substrings.",
     "concepts": [
      "Channels and payments",
      "Network and RPC reliability"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "chukwuma619/fiber-studio",
       "hash": "33b609c187",
       "subject": "Enhance error handling and user feedback in channel dialogs"
      },
      {
       "repo": "chukwuma619/fiber-studio",
       "hash": "92c4606a7f",
       "subject": "Enhance channel direction labels and UI components"
      },
      {
       "repo": "chukwuma619/fiber-studio",
       "hash": "4975df90cf",
       "subject": "Enhance channel version handling and UI updates"
      }
     ]
    },
    {
     "title": "Pre-checking Channel V2 via graph_nodes before open_channel",
     "lesson": "Earlier advice was to check local node_info.features and the peer's graph_nodes features for channel_v2 before calling open_channel. It also suggested showing an upgrade message, with legacy channels staying on V1.",
     "concepts": [
      "Channels and payments",
      "Other"
     ],
     "status": "superseded",
     "note": "Superseded by c0101/c0102/c0103: graph features can be stale and the authoritative check happens inside open_channel. Its claim that pre-upgrade channels stay on V1 is superseded by c0154, which says V1 channels are now rejected.",
     "sources": [
      {
       "repo": "chukwuma619/fiber-studio",
       "hash": "3454a58c8c",
       "subject": "Enhance channel management and UI components for legacy support"
      }
     ]
    },
    {
     "title": "open_channel returns temporary_channel_id",
     "lesson": "The open_channel RPC result field is temporary_channel_id, not channel_id. Deserializing channel_id always yields None. When searching graph_nodes, page through results with the cursor instead of reading only the first page.",
     "concepts": [
      "Channels and payments",
      "Data encoding (molecule, hex, bigints)",
      "Network and RPC reliability"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "chukwuma619/fiber-studio",
       "hash": "4975df90cf",
       "subject": "Enhance channel version handling and UI updates"
      }
     ]
    },
    {
     "title": "Payment direction in one-way channels",
     "lesson": "Use can_be_tlc_sender = !is_one_way || !is_acceptor and can_be_tlc_receiver = !is_one_way || is_acceptor, computed from list_channels fields. In a one-way channel the funder can only send and the acceptor can only receive.",
     "concepts": [
      "Channels and payments"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "chukwuma619/fiber-studio",
       "hash": "92c4606a7f",
       "subject": "Enhance channel direction labels and UI components"
      }
     ]
    },
    {
     "title": "Detecting never-broadcast transactions via double-spent inputs",
     "lesson": "A transaction that is never broadcast stays TxStatus::Unknown forever. Watch its input OutPoints. If get_live_cell shows an input is no longer live, the input's creating tx is Committed, and the tracked tx is still Unknown on a re-check, mark the tracked tx rejected after N confirmations. Reset that verdict if a reorg makes the cell live again, and skip the poll on transient RPC errors so confirmation tracking is not reset.",
     "concepts": [
      "Transaction building and fees",
      "Network and RPC reliability",
      "Indexer queries and cell collection"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "f9cfacaf97",
       "subject": "fix: abort unconfirmed external funding channel when input is spent (#1747)"
      }
     ]
    },
    {
     "title": "Send TxAbort when rejecting an invalid OpenChannel",
     "lesson": "When an inbound OpenChannel fails validation (InvalidParameter or CapacityError), send a TxAbort with the channel_id and the reason. Only logging leaves the initiator stuck in NegotiatingFunding until its funding timeout. Resource-limit rejections can stay silent because the initiator may retry them.",
     "concepts": [
      "Channels and payments",
      "Network and RPC reliability"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "59c25efa69",
       "subject": "fix: send TxAbort when rejecting an invalid OpenChannel (#1697) (#1736)"
      }
     ]
    },
    {
     "title": "MPP status rules and persist-before-reply for AddTlc",
     "lesson": "Mark an MPP payment Success, and settle upstream (trampoline or CCH), as soon as any shard is fulfilled with the preimage. Set Failed only after every issued attempt has finished, because a later shard can still succeed. AddTlc should reply only after the accepted TLC or queued Add has been persisted, so payment state survives a restart.",
     "concepts": [
      "Channels and payments"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "2c039dcf8b",
       "subject": "fix(payment): settle MPP on fulfillment and defer final failure (#1732)"
      }
     ]
    },
    {
     "title": "Near-expiry received TLCs with a known preimage must be claimed on chain",
     "lesson": "Before failing a near-expiry received TLC with ExpiryTooSoon, check for a pending fulfill in removed_reason or retryable_tlc_operations and verify that hash(preimage) equals the TLC's payment_hash. If a fulfill exists, force-close and restore the preimage to the store and watchtower instead. check_remove_tlc must reject a fail for a TLC that already has a valid fulfill. Before any force close, re-store and re-notify all pending claim preimages, because watchtower notifications may have been lost across a restart.",
     "concepts": [
      "Channels and payments",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "29baff75d5",
       "subject": "fix: unify received TLC expiry and claim protection (#1737)"
      }
     ]
    },
    {
     "title": "Skip closed upstream channels in trampoline restart settlement",
     "lesson": "When settling or failing a trampoline payment on restart, skip upstream channels in ChannelState::Closed instead of sending RemoveTlc to them. Those TLCs settle on chain, so keep the preimage in the PreimageStore; the peer reclaims an unpaid TLC after expiry. Sending RemoveTlc to a closed channel only produces InvalidState errors.",
     "concepts": [
      "Channels and payments"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "e248cedca7",
       "subject": "fix: do not settle upstream TLCs on a closed channel (#1744)"
      }
     ]
    },
    {
     "title": "Reestablish timeout as a pausable online-time budget",
     "lesson": "Restarting the recovery or reestablish timeout on every reconnect lets a peer stall TLC resolution forever by repeatedly disconnecting. Keep one online-time budget per recovery: pause it on disconnect, resume it on reconnect, and schedule checks after the remaining time. Clear the budget only when the channel is ready again.",
     "concepts": [
      "Channels and payments",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "554f7c64bf",
       "subject": "fix: preserve V2 recovery timeout across reconnects (#1733)"
      }
     ]
    },
    {
     "title": "V2 shutdown flag handling and funding output check",
     "lesson": "Reject a late ShutdownV2 once ShuttingDown has WAITING_COMMITMENT_CONFIRMATION set. OR AWAITING_PENDING_TLCS into the existing flags instead of replacing them, and do not re-sign the outstanding CommitmentSigned during reestablish once a close tx is published. During funding, the initiator must verify that the peer's TxUpdate funding output covers to_local + to_remote + both reserved CKB amounts. For UDT channels, read the amount from the first 16 bytes of the cell data, little-endian. Without that check the local side can end up paying the peer's share.",
     "concepts": [
      "Channels and payments",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "f3322ed923",
       "subject": "fix: harden V2 shutdown and reestablishment recovery (#1748)"
      }
     ]
    },
    {
     "title": "Acknowledge on-chain TLC removal when the payment record is missing",
     "lesson": "If the payer's payment attempt or session is missing from the store during on-chain TLC reconciliation, still acknowledge the removal by sending OnChainTlcRemoveCompleted. Returning early to \"retry\" makes CheckChannels pick the same TLC on every run, and the closed channel never finishes settlement.",
     "concepts": [
      "Channels and payments"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "cd2c092447",
       "subject": "fix: finish on-chain settlement when a payer attempt is gone (#1753)"
      }
     ]
    },
    {
     "title": "Mission control penalty for final-hop amount or expiry errors",
     "lesson": "When the recipient returns FinalIncorrectTlcAmount or FinalIncorrectExpiryDelta, penalize the last channel, the one into the recipient, with fail_pair(nodes, index). Mark all earlier pairs succeeded with succeed_range_pairs(nodes, 0, index - 1). The old off-by-one penalized a good upstream channel, so retries kept using the bad last hop.",
     "concepts": [
      "Channels and payments"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "326cdc4a43",
       "subject": "fix: penalize the channel that delivered a bad final TLC (#1752)"
      }
     ]
    },
    {
     "title": "Tag CCH invoice events with their backend source",
     "lesson": "In a cross-chain hub, the same payment_hash exists on both Fiber and Lightning, so invoice events keyed only by payment_hash can be confused or spoofed. Tag each event with its backend source at the adapter, and drop events whose source does not match the order's incoming invoice type.",
     "concepts": [
      "Invoices",
      "Security hardening",
      "Channels and payments"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/fiber",
       "hash": "85f01b65e0",
       "subject": "fix(cch): bind invoice events to incoming payment source (#1740)"
      }
     ]
    },
    {
     "title": "backup RPC under Biscuit auth before fnn v0.10.0",
     "lesson": "Before fnn v0.10.0, the backup RPC always failed closed under Biscuit auth because its rule was registered as backup_now. Upgrade to v0.10.0 or later if you rely on authorized backups.",
     "concepts": [
      "Login and authorization"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "RetricSu/fiber-pay",
       "hash": "73c7d6fe63",
       "subject": "chore: upgrade Fiber target to fnn v0.10.1 (#212)"
      }
     ]
    }
   ]
  },
  {
   "area": "Apps and UI",
   "summary": "This week's lessons are mostly about building and checking dApp transactions safely off-chain. They cover exact amount handling, filtering untrusted indexer results, keeping JS codecs in byte-for-byte agreement with Rust scripts, and handling redeployed data-hashed scripts. Several cards also cover robustness in multi-step on-chain flows and in front-end delivery.",
   "lessons": [
    {
     "title": "Exact CKB-to-shannon conversion with BigInt",
     "lesson": "Convert user-entered CKB amounts to shannons with BigInt string arithmetic: BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0')). Never use parseFloat(amount) * 1e8. First validate the input with /^\\d+(\\.\\d{1,8})?$/, which rejects exponents, hex and commas, and reject any result above u64::MAX (0xffffffffffffffffn).",
     "concepts": [
      "Data encoding (molecule, hex, bigints)",
      "Capacity and cell size"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "b6e28a4100",
       "subject": "Make browser lab approachable with guided decimal-input experiments"
      }
     ]
    },
    {
     "title": "Filtering untrusted get_cells results and re-checking before signing",
     "lesson": "Anyone can create cells under a public type script, so do not trust every result of a prefix get_cells search. Keep only cells with the exact expected type args length, the expected lock (code_hash, hash_type and args) and data that decodes. Before signing a claim against shared cells, re-read the chain, rebuild the transaction, and abort if the amounts differ from what the user confirmed.",
     "concepts": [
      "Indexer queries and cell collection",
      "Security hardening",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "a3775ebe48",
       "subject": "feat: claim prize, return ticket deposit and recover keepsake in Tickets"
      }
     ]
    },
    {
     "title": "Pinning JS codecs and derivations to Rust test vectors",
     "lesson": "When off-chain JS encodes or derives cell data that a Rust type script decodes or re-derives byte for byte, test the JS against JSON vectors generated by the Rust code, using a distinct value in every field so a wrong offset fails. Mirror the contract's validation refusals and its exact ordering and rounding: BTreeMap ascending key order, BigInt floor division with the dust going to fixed indices, and merging duplicates before dividing. The chain only returns a bare error code, so only this off-chain check can tell you which rule failed.",
     "concepts": [
      "Data encoding (molecule, hex, bigints)",
      "Testing and devnet",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "38c5f839ea",
       "subject": "feat: derive a batch's settlement state, pinned to Rust"
      },
      {
       "repo": "toastmanAu/daowow",
       "hash": "07b313eacd",
       "subject": "feat: settlement funding codec, pinned to the Rust vector"
      }
     ]
    },
    {
     "title": "Resolving cell deps per cell after redeploying a data-hashed script",
     "lesson": "After a data/data1 type script is redeployed with a new code hash, old cells still run against the old code. Keep a list of retired deployments and query the indexer for every one. Pick each cell's cell dep by matching the codeHash and hashType of that cell's own type script, not a single 'current' manifest entry.",
     "concepts": [
      "Cell deps and script lookup",
      "Type ID and upgrades",
      "Indexer queries and cell collection"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "ea2df1bbd1",
       "subject": "feat(app): rounds under a replaced ticket contract stay usable"
      }
     ]
    },
    {
     "title": "Pre-sign checkers must mirror every on-chain comparison",
     "lesson": "A pre-sign checker that reuses the builder's assumptions will miss the builder's bugs, so make it compare every field the script compares, outputs_data included. When you add data to an output, count those bytes in its occupied capacity (8 + data + lock + type). Replay refused transactions in ckb-debugger against the deployed binaries to confirm the fix.",
     "concepts": [
      "Capacity and cell size",
      "Transaction building and fees",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "d60153aee0",
       "subject": "fix: the batch receipt cell carries its 73-byte record"
      }
     ]
    },
    {
     "title": "Witness data in input_type and folding sub-minimum change",
     "lesson": "Put script-specific witness data in WitnessArgs.input_type of each input so the lock field stays free and a wallet can sign one transaction spending several such inputs. If the change left after a fixed fee is below a plain cell's minimum occupied capacity, add it to an existing output instead of creating a change cell that cannot exist.",
     "concepts": [
      "Witnesses and signatures",
      "Transaction building and fees",
      "Capacity and cell size"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "3dc1b8675b",
       "subject": "feat: the return-deposit builder, its retire decision, and the memento burn"
      }
     ]
    },
    {
     "title": "Lock-based fallback when a stored out point goes stale",
     "lesson": "A saved out point stops being valid once the cell is consumed and recreated. Use the recorded out point if it is still live; otherwise find the unique live cell matching the exact lock (code_hash, hash_type, args). In both cases, still check the cell's contents against the recorded values.",
     "concepts": [
      "Indexer queries and cell collection"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "fd33a35810",
       "subject": "client: verify rule 1 accepts the unique live Node Cell when the descriptor's recorded out point is dead (Arm replaces t"
      }
     ]
    },
    {
     "title": "Saving local state after the first step of a multi-step flow",
     "lesson": "In flows like Create followed by Arm, save local state right after the first transaction is sent. If you wait until the whole flow finishes, a failure in a later step leaves an on-chain object the user cannot find or cancel. Add the extra fields, such as the descriptor, once the later steps succeed.",
     "concepts": [
      "Transaction building and fees",
      "Other"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/dead-man-switch",
       "hash": "cd29be2349",
       "subject": "Write: keep the switch in My switches from Create on; site with CRT 13f17ac"
      }
     ]
    },
    {
     "title": "Cutoff epoch for retired data-hashed code",
     "lesson": "A redeployed data/data1 script leaves the old code cell live, so anyone can keep creating cells under the old, weaker rules. If you still accept the old deployment for existing cells, record a retiredFromEpoch and only accept instances created before it. Also check with get_live_cell that the retired code cell is still live and that its data hash still equals the code hash.",
     "concepts": [
      "Type ID and upgrades",
      "Cell deps and script lookup",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "4dabd1caa4",
       "subject": "fix: the wait flag and a retirement cannot be mis-stated (review I1, I2)"
      }
     ]
    },
    {
     "title": "Blocking CDN caching of dApp JS",
     "lesson": "A CDN zone setting can override the host's max-age=0, so users keep running stale JS (for example, a build missing a per-wallet limit check) against live chain state. Set an explicit `Cache-Control: no-cache` on every path, for example in the Cloudflare Pages `_headers` file, and add a test asserting it.",
     "concepts": [
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "b50a14d65d",
       "subject": "fix: browsers revalidate every file on each load"
      }
     ]
    },
    {
     "title": "Nervos DAO hold time with term-locked withdrawals",
     "lesson": "DAO withdrawals only pay out at the end of a 180-epoch cycle (about 30 days). If a lock blocks the phase-1 withdrawal until a term ends, the funds stay until the end of the next cycle. Estimate the hold time as (termCycles + 1) × 180 epochs, not termCycles × 180.",
     "concepts": [
      "Since and time locks",
      "Other"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "186405ba35",
       "subject": "fix: the app and README say how long a deposit is really held"
      }
     ]
    },
    {
     "title": "Checking the minimum term only at creation",
     "lesson": "For a flow with a fixed absolute deadline, enforce the minimum term only at Create. Later steps, such as Arm after the guardians' commits, should only refuse a deadline that is already in the past. Re-checking the term against the current time rejects valid setups once real time has passed.",
     "concepts": [
      "Since and time locks",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "13f17ac179",
       "subject": "client: Arm does not re-check the minimum term"
      }
     ]
    },
    {
     "title": "Avoiding tx hash collisions with retired sponsored offers",
     "lesson": "If a new unsigned sponsored transaction would have the same hash as an earlier, retired offer, add 1 shannon to the fee, taken from the owner change output, until tx.hash() is unique. Never modify bytes that are already signed. Persist the owner-signed bytes durably before sponsor signing or broadcast, so retries after a lost response are idempotent and need no RPC.",
     "concepts": [
      "Transaction building and fees",
      "Witnesses and signatures",
      "Network and RPC reliability"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "HeySomtee/streak",
       "hash": "ecf5b26caf",
       "subject": "fix(payments): persist acceptance and recover signature delivery [skip ci]"
      }
     ]
    },
    {
     "title": "Verified lineage walk to rebuild Merkle/SMT leaves",
     "lesson": "When a cell stores only a Merkle/SMT root, rebuild the leaves by walking back through get_transaction along each input's previous_output. At each step require tx_status 'committed' and re-apply the decoded witness to the previous state, checking it reproduces the next recorded data, so a lying RPC node is caught. Cap the number of steps and fail loudly when the cap is hit.",
     "concepts": [
      "Indexer queries and cell collection",
      "Data encoding (molecule, hex, bigints)",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "7b48dcc127",
       "subject": "feat: rebuild a ticket's paid set from its transaction history"
      }
     ]
    },
    {
     "title": "Mobile-safe audio visualisation",
     "lesson": "Do not route an <audio> element through createMediaElementSource: on mobile, especially iOS Safari, that path can go silent on Bluetooth speakers, follows the mute switch and stops when the screen locks. Let the element play directly and feed an AnalyserNode from createMediaStreamSource(audio.captureStream()), or show a synthetic spectrum where captureStream is missing.",
     "concepts": [
      "Other"
     ],
     "status": "current",
     "note": "General web front-end lesson, not specific to CKB.",
     "sources": [
      {
       "repo": "toastmanAu/html-jukebox",
       "hash": "bf6697060b",
       "subject": "fix: play music straight to the device so Bluetooth speakers work (#8)"
      }
     ]
    }
   ]
  },
  {
   "area": "CCC (TypeScript SDK)",
   "summary": "This week's CCC lessons are mostly about making the JSON-RPC transport and cell queries reliable: checking HTTP status for fallback, releasing error bodies without stalling, and coping with stale caches and indexer lag. There are also devnet setup pitfalls with KnownScript overrides and a few wallet and signing hardening fixes (JoyID keyType allowlist, untrusted RPC capacities, safe restore of the saved connection).",
   "lessons": [
    {
     "title": "Check response.ok in fetch-based JSON-RPC transports",
     "lesson": "fetch() resolves on HTTP 4xx/5xx, so calling response.json() without checking response.ok can parse an error body and never fall back to the next RPC endpoint. Throw when !response.ok so fallback moves on. Keep JSON-RPC errors returned under HTTP 200 as real errors that do not trigger fallback.",
     "concepts": [
      "Network and RPC reliability"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "df37b2778c",
       "subject": "fix(core): fall back on non-success HTTP responses"
      }
     ]
    },
    {
     "title": "Cancel error response bodies without awaiting",
     "lesson": "On a non-OK HTTP response, release the body with response.body?.cancel() but do not await it. If the response was cloned (e.g. by a logging fetch wrapper), the cancel promise can stay pending and stall RPC fallback. Use `try { void response.body?.cancel().catch(() => {}) } catch {}` and then throw the HTTP status error, so neither a rejection nor a synchronous throw can replace it.",
     "concepts": [
      "Network and RPC reliability"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "f4295dc9c6",
       "subject": "fix(core): avoid waiting for cloned response cancellation"
      }
     ]
    },
    {
     "title": "Awaiting body cancel before throwing on HTTP errors",
     "lesson": "Before rejecting a non-OK response (429/503) to fall back to another endpoint, call response.body?.cancel() so the unread error body does not keep the connection open and leak resources. Swallow any cancel rejection so it cannot replace the HTTP status error.",
     "concepts": [
      "Network and RPC reliability"
     ],
     "status": "superseded",
     "note": "Cancelling the body is still correct, but awaiting it was replaced by c0112. If the response was cloned, the awaited cancel can hang and stall fallback, so fire it without await.",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "496abd8688",
       "subject": "fix(core): cancel HTTP error bodies before fallback"
      }
     ]
    },
    {
     "title": "Devnet overrides for secp256k1 KnownScripts",
     "lesson": "ClientPublicTestnet's built-in KnownScript tables point at testnet cell deps, so on a local devnet pass a `scripts` override. Map Secp256k1Blake160 and Secp256k1Multisig to the devnet genesis dep groups: outputs 0 and 1 of genesis block transaction 1 (read via get_block_by_number 0x0), with depType 'depGroup'. The code hashes are unchanged.",
     "concepts": [
      "Cell deps and script lookup",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "174fcfd1d6",
       "subject": "scenario: devnet owner key, CCC devnet scripts, CJS import of @ckb-ccc/core, GRACE = 24 h"
      }
     ]
    },
    {
     "title": "Use findCellsOnChain for shared live state",
     "lesson": "client.findCells merges results from the client's local cache, which can still hold outputs of your own earlier transactions after other parties spent them on chain. When you need the true live cell set, such as state shared with other actors or runners, use client.findCellsOnChain.",
     "concepts": [
      "Indexer queries and cell collection"
     ],
     "status": "current",
     "note": "Medium confidence.",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "6deabcd3a7",
       "subject": "client: read cells from the chain only (findCellsOnChain); CCC's cache kept spent Node Cells of the signer's own Create "
      }
     ]
    },
    {
     "title": "Wait for the building client's indexer to sync",
     "lesson": "Different clients and indexers can show different live cells for a while after a transaction commits. Before building a transaction from cells you just updated, poll through the same client that will build it until it sees the new state. Log what each client sees on timeout.",
     "concepts": [
      "Indexer queries and cell collection",
      "Testing and devnet",
      "Network and RPC reliability"
     ],
     "status": "current",
     "note": "Medium confidence.",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "f44d7293e9",
       "subject": "scenario: wait until the owner client sees the Node Cells in state 1 before Arm; report both views on timeout"
      }
     ]
    },
    {
     "title": "Don't trust RPC-reported input capacities when completing fees",
     "lesson": "completeInputsByCapacity and completeFeeBy trust the cell capacities the RPC node reports, so a lying node can understate inputs and the difference silently becomes fee. Before and after signing, resolve each input by fetching and hashing its creating transaction. Then recompute the fee yourself, enforce a ceiling, and check that every output and its lock is the one you intended.",
     "concepts": [
      "Transaction building and fees",
      "Security hardening",
      "Indexer queries and cell collection"
     ],
     "status": "current",
     "note": "Medium confidence.",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "189a62abb2",
       "subject": "fix: entries and refunds are signed only after their own rules pass on proven cells"
      }
     ]
    },
    {
     "title": "Wallet discovery with SignersController",
     "lesson": "To support every CCC wallet without the @ckb-ccc/connector UI, call `new ccc.SignersController().refresh(client, callback, {name, icon})`. Keep the callback registered and update the picker, because it fires again as EIP-6963 wallets announce themselves. Treat signers that are `instanceof ccc.SignerDummy` as download links, not connectable wallets.",
     "concepts": [
      "Witnesses and signatures",
      "Login and authorization"
     ],
     "status": "current",
     "note": "Medium confidence.",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "d49df9dc97",
       "subject": "feat: connect with any wallet CCC supports"
      }
     ]
    },
    {
     "title": "Registering NervosDao on devnet",
     "lesson": "CCC has no KnownScript.NervosDao entry for devnet, so register it by hand. The cell dep is the genesis tx 0 output whose type script hash equals the DAO code hash 0x82d76d1b…3f2e, with hashType 'type' and depType 'code'. Find that output index by hashing each output's type script rather than hardcoding it.",
     "concepts": [
      "Cell deps and script lookup",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "980a65cc9e",
       "subject": "scenario: Nervos DAO script entry from the genesis block"
      }
     ]
    },
    {
     "title": "Safe restore of saved connector state",
     "lesson": "The connector restores the saved wallet from the localStorage key \"ccc-connection-info\", and corrupt JSON or a storage error used to throw in connectedCallback and stop it mounting. Wrap the read in try/catch and check that the value is a non-array object with string signerName and walletName. Reset both fields before loading so a remount does not keep stale names.",
     "concepts": [
      "Login and authorization"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "0fb264a7c8",
       "subject": "fix(connector): tolerate malformed saved connection data"
      }
     ]
    },
    {
     "title": "Store builder idempotency marks on the transaction",
     "lesson": "Don't track per-transaction builder state in module-level WeakMaps keyed by Transaction or CellInput objects. Those marks are lost on tx.clone() or a JSON round-trip, and they leak to other transactions sharing the same CellInput. Store the mark on the transaction itself, e.g. CellOutput.lockProxyRestoredFrom, and dedupe by scanning tx.outputs.",
     "concepts": [
      "Transaction building and fees",
      "Other"
     ],
     "status": "current",
     "note": "Medium confidence.",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "7a850cb1a4",
       "subject": "fix(spore): tag lock-proxy restores on the output"
      }
     ]
    }
   ]
  },
  {
   "area": "Rust scripts and ckb-std",
   "summary": "This week's Rust-script lessons are mostly about enforcing time with the input `since` field: flag bytes, epoch encoding and overflow, millisecond vs second units, and median time vs tip time. They also cover binding proofs to the full tx hash, keeping capacity floors on partial payouts, output ordering, exact hash_type bytes, and test-only build variants.",
   "lessons": [
    {
     "title": "Enforcing \"not before epoch N\" via input since",
     "lesson": "A script cannot read the current epoch, so it reads its own input's since with load_input_since(0, Source::GroupInput). It then checks that the flags are absolute and epoch-type ((since >> 56) == 0x20) and that the epoch number is at least N. A missing since, or a block-number since with the same raw value, must be rejected. Off-chain builders must set since = 0x2000000000000000 | epochNumber and refuse to build before the target epoch, or the tx is rejected as immature or by the script.",
     "concepts": [
      "Since and time locks",
      "Transaction building and fees",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "298004d32d",
       "subject": "feat(tools): the seal is built and checked against the draw wait"
      },
      {
       "repo": "toastmanAu/daowow",
       "hash": "b137728aeb",
       "subject": "feat(contract): the seal waits one DAO cycle after entries close"
      },
      {
       "repo": "toastmanAu/daowow",
       "hash": "3bc8a826da",
       "subject": "test(devnet): the seal is refused before the draw epoch and accepted at it"
      }
     ]
    },
    {
     "title": "Binding proofs and signatures to the full tx hash",
     "lesson": "Don't bind a proof or signature to a custom digest of only GroupInput[0] and Output[0]. An attacker can add another same-lock input, swap cell_deps such as the verifier key, or add outputs, and the proof still verifies. Bind to load_tx_hash instead. Because the tx hash excludes witnesses, build the tx with a same-length placeholder witness, hash it, then insert the real proof.",
     "concepts": [
      "Witnesses and signatures",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "CECILIA-MULANDI/zk-Lock",
       "hash": "fa4102e790",
       "subject": "Bind the proof to tx_hash (#21)"
      }
     ]
    },
    {
     "title": "Seconds vs milliseconds in timestamp since",
     "lesson": "Header timestamps are in milliseconds, but an absolute timestamp since (flag byte 0x40) uses median block time in seconds. Check the flag byte, then compare the low 56 bits against deadline_ms.div_ceil(1000). A lock that lets anyone spend should also require every GroupInput to carry the pinned type hash, so the type script always runs.",
     "concepts": [
      "Since and time locks",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "HeySomtee/streak",
       "hash": "21fbbcf03c",
       "subject": "feat: add durable sign-once payment queue [skip ci]"
      }
     ]
    },
    {
     "title": "Capacity floor on partial payouts",
     "lesson": "When a type-script cell pays out part of its capacity, either close it exactly (leftover 0) or leave at least its occupied capacity. Before each partial payout, check that unpaid principal and unredeemed prizes are each zero or at least the cell's minimum capacity, so no final step can strand a cell below its floor. Payout cells also need their own occupied capacity, so top up small prizes from the payee's funds.",
     "concepts": [
      "Capacity and cell size",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "19df9e0ecd",
       "subject": "feat: redemption witness codec, prize derivation and the claim-prize builder"
      },
      {
       "repo": "toastmanAu/daowow",
       "hash": "fa339a9c89",
       "subject": "fix: review of the settlement tooling"
      }
     ]
    },
    {
     "title": "Spoofable \"first output under lock X\" payment detection",
     "lesson": "A contract that treats the first output under lock X as the payment to X can be fooled by an earlier output with the same lock, such as a settlement cell or the sponsor's change. Put payment outputs first and identify the state cell by its type script.",
     "concepts": [
      "Security hardening",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "fa339a9c89",
       "subject": "fix: review of the settlement tooling"
      }
     ]
    },
    {
     "title": "Molecule hash_type byte values",
     "lesson": "In the Script encoding, hash_type is data=0, type=1, data1=2, data2=4. A wrong value (for example 2 or 3 for data2) changes the script hash, so indexer queries return nothing. Assert the raw bytes against the CKB spec or test on a real devnet, because mocks that reuse the same constant on both sides won't catch the mistake.",
     "concepts": [
      "Data encoding (molecule, hex, bigints)",
      "Indexer queries and cell collection",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "a37fb85ada",
       "subject": "service: hash_type byte of data2 is 4 (2 is data1): the Node Cell query found nothing and every run reported dropped; un"
      }
     ]
    },
    {
     "title": "Comparing packed epoch values",
     "lesson": "Decode epochs into (number, index, length) before comparing them. Compare the fractional parts by cross-multiplying (index_a*length_b vs index_b*length_a), because epoch length varies and raw packed integers don't order correctly.",
     "concepts": [
      "Since and time locks"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "3bc8a826da",
       "subject": "test(devnet): the seal is refused before the draw epoch and accepted at it"
      }
     ]
    },
    {
     "title": "24-bit epoch number overflow",
     "lesson": "An absolute epoch since holds only a 24-bit epoch number (max 0xFFFFFF). Compute future unlock epochs with checked addition and refuse any result above that maximum at cell creation, or the cell can never be unlocked.",
     "concepts": [
      "Since and time locks"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "c12ab944c2",
       "subject": "feat(core): a round's draw epoch is entries close plus one DAO cycle"
      },
      {
       "repo": "toastmanAu/daowow",
       "hash": "b137728aeb",
       "subject": "feat(contract): the seal waits one DAO cycle after entries close"
      }
     ]
    },
    {
     "title": "Median time vs tip timestamp for deadlines",
     "lesson": "On-chain since checks use the median time of past blocks, but clients often use the tip header's timestamp, and the two can diverge widely after devnet time travel. Compute deadlines from max(ceil(tipMs/1000), medianSeconds) so minimum-term checks hold on both sides.",
     "concepts": [
      "Since and time locks",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "6c847e2bf8",
       "subject": "scenario: deadline from max(tip, median) so the 1-day minimum term holds after time travel"
      }
     ]
    },
    {
     "title": "Separate builds for test-only contract constants",
     "lesson": "Put test variants that change protocol constants behind a Cargo feature, built as a separate binary with its own code hash and deployment file. Client deployment parsing and deploy scripts should reject that variant on mainnet. Off-chain code should read the constant from the deployment rather than hardcode the default.",
     "concepts": [
      "Testing and devnet",
      "Cell deps and script lookup",
      "Type ID and upgrades"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "d9c36e998b",
       "subject": "Rehearsal (drill) deployment for testnet: GRACE 600 s as a build feature"
      }
     ]
    },
    {
     "title": "Validating context in offline ckb-verification verifiers",
     "lesson": "Before running TransactionScriptsVerifier or ContextualTransactionVerifier on caller-supplied context, validate that context. Check well-formed epochs, a contiguous parent/median-time header chain, and transaction_info that matches the creation header and comes before the tip. DAO withdrawal headers need a nonzero AR, and every header dep and origin block needs an explicit extension entry (null if empty). Skipping these checks leads to panics or results that silently differ from a real node.",
     "concepts": [
      "Testing and devnet",
      "Security hardening"
     ],
     "status": "current",
     "note": "Medium confidence: these checks come from a single project.",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "184af5d80c",
       "subject": "Build offline CKB WASM verifier with native parity checks"
      }
     ]
    }
   ]
  },
  {
   "area": "Wallets and signing",
   "summary": "This week's wallet and signing lessons are mostly about not trusting what a wallet or node hands back. Re-validate transactions, input cells, witnesses and signature payloads against your own trusted data before and after signing. A smaller set covers handling Bitcoin PSBTs from JoyID and other wallets, JoyID message verification, devnet signing tests and wallet selection quirks.",
   "lessons": [
    {
     "title": "Re-validate the transaction before and after wallet signing",
     "lesson": "Most wallets show only a signing hash, so validate the transaction yourself before signing. Check outputs, output data and builder witnesses after prepareTransaction and again after funding, because CCC calls prepareTransaction again while completing fees. After signer.signTransaction, check that signed.hash() equals the pre-sign tx.hash(), that each WitnessArgs input_type and output_type survived byte for byte, and that the fee still covers the real signature size rather than the placeholder's.",
     "concepts": [
      "Witnesses and signatures",
      "Transaction building and fees",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "350bec07c0",
       "subject": "test: pin every guard the mutation probes found unpinned; drop one redundant clause"
      },
      {
       "repo": "toastmanAu/daowow",
       "hash": "f67dc49a32",
       "subject": "feat: sign a claim or return only when the checker passes it, before and after"
      }
     ]
    },
    {
     "title": "Load input cells from their source transactions",
     "lesson": "A CKB signature commits only to an input's out point, not to its capacity, lock or type. Node-supplied cell info (completeExtraInfos, getInputsCapacity) can therefore trick a pre-sign check into approving a transaction that burns a large cell as fee. Fetch each input's source transaction, require src.hash() === outPoint.txHash, and read the output and outputsData from it. After signing, take only the witnesses from the wallet's tx, and reject unexpected since values or header deps.",
     "concepts": [
      "Witnesses and signatures",
      "Transaction building and fees",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "9e5d53a535",
       "subject": "fix: prove every input cell before signing; review fixes"
      }
     ]
    },
    {
     "title": "Policy checks on outputs, fee and inputs of the returned transaction",
     "lesson": "Before broadcasting the transaction the wallet returns, check three things: every output not owned by a contract is a plain cell under the holder's lock, the fee is above zero and capped (for example at 1 CKB), and the inputs hold no unexpected cells. A type script that only walks its own witness items won't notice extra cells of the same type in the inputs, so the client must reject inputs the witness does not name.",
     "concepts": [
      "Witnesses and signatures",
      "Transaction building and fees",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "0f65a89193",
       "subject": "feat: the checker for claim, return and burn transactions"
      }
     ]
    },
    {
     "title": "Server co-signing of client-built transactions",
     "lesson": "A server that co-signs a client-built transaction should first parse it with Transaction.fromBytes and load every input cell from the chain. It should then check outputs, amounts and fee against policy, and sign only its own inputs with signOnlyTransaction. Finally, assert that signed.hash() === tx.hash(); a changed hash invalidates the claimant's existing signature.",
     "concepts": [
      "Witnesses and signatures",
      "Transaction building and fees",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/openswap",
       "hash": "93996184a6",
       "subject": "Test-token faucet: claimant-funded claims co-signed by a separate faucet wallet via a Pages Function"
      }
     ]
    },
    {
     "title": "JoyID PSBT signing with autoFinalized false",
     "lesson": "JoyID's sign-psbt popup returns a raw extracted transaction when autoFinalized is true, and it rejects PSBTs with inputs it cannot sign. Always request autoFinalized: false and parse the returned PSBT. Check that its unsigned transaction matches the one you sent, then finalize with bitcoinjs-lib only the inputs that gained a new signature (Taproot needs initEccLib).",
     "concepts": [
      "Witnesses and signatures",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "426b538b0f",
       "subject": "fix(joy-id): always return a PSBT from signPsbt"
      }
     ]
    },
    {
     "title": "Check PSBT input readiness before finalizeIdx",
     "lesson": "Before calling @scure/btc-signer finalizeIdx on each input, confirm the input is ready. It needs a witnessUtxo or nonWitnessUtxo, a redeemScript or witnessScript when the output is wrapped, and enough partialSig or tapScriptSig entries whose pubkey (and leafHash) match the script. Skip inputs that are not ready, and finalize on the original parsed transaction rather than a scratch copy without UTXO data, so fee and UTXO checks still run.",
     "concepts": [
      "Witnesses and signatures",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "fd4c9a5d7a",
       "subject": "refactor(btc): share stock-scure PSBT finalization across wallets"
      }
     ]
    },
    {
     "title": "Devnet tests need a real secp256k1 lock to exercise signing",
     "lesson": "Under an always-success lock, a test never checks that the signature covers the witnesses. That matters most when contract data shares a WitnessArgs with the signature, for example in inputType. Move the test cells to a secp256k1 lock, using its code cell and dep group from genesis, and sign with ccc.SignerCkbPrivateKey. The 20-byte lock args need 6 more CKB of capacity than the 14-byte fixture args.",
     "concepts": [
      "Witnesses and signatures",
      "Testing and devnet",
      "Capacity and cell size"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "5344cf9c6f",
       "subject": "test: devnet accepts JS-built claims and returns under a real signature lock"
      }
     ]
    },
    {
     "title": "Duplicate wallet names and concurrent refreshes in SignersController",
     "lesson": "EIP-6963 wallets choose their own names, so CCC's SignersController can report two different wallets under one name or merge them. A saved choice keyed by wallet name plus signer name can then auto-reconnect the wrong extension. Give duplicate names distinct keys and never auto-restore them. Serialise controller.refresh calls so a stale callback cannot overwrite the wallet list.",
     "concepts": [
      "Login and authorization",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "64ffbf1c31",
       "subject": "fix: security review of the wallet picker"
      }
     ]
    },
    {
     "title": "JoyID sub-key signing needs the COTA aggregator and CSP allowances",
     "lesson": "JoyID sub-key wallets sign through the COTA aggregator, so keep the aggregator URL in your JoyID config. Also allow the aggregator host and wss://*.ckb.dev in your CSP connect-src, or signing and RPC calls are silently blocked.",
     "concepts": [
      "Witnesses and signatures",
      "Network and RPC reliability"
     ],
     "status": "current",
     "note": "Low confidence: inferred from the commit message only. The diff showed just a rebuilt bundle.",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "86793bb5e1",
       "subject": "web: keep the COTA aggregator so JoyID sub-key wallets can sign; CSP allows it and the ckb.dev websockets"
      }
     ]
    }
   ]
  },
  {
   "area": "CKB node, RPC and indexer",
   "summary": "This week's node/RPC/indexer lessons are mostly about not trusting RPC responses blindly: verify hashes, block numbers, epoch fields and tip consistency before using or caching data. Several also cover devnet testing techniques (advancing median time, reproducing reorgs) and the removal of the preview network spec.",
   "lessons": [
    {
     "title": "Validate header and epoch lookups before using timestamps",
     "lesson": "After get_header_by_number or get_epoch_by_number, handle a null result and check that the returned number equals the one you requested. To get an epoch's start time, call get_epoch_by_number and read the header at its start_number. Then decode that header's epoch field: the low 24 bits must equal the epoch and bits 24-39 (the block's index within the epoch) must be 0. Cache timestamps only for existing, confirmed blocks within a plausible range, and label future times projected from the tip as estimates.",
     "concepts": [
      "Network and RPC reliability",
      "Since and time locks",
      "Data encoding (molecule, hex, bigints)"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "a8c736cfb2",
       "subject": "feat: ticket cards with number, hash and dates on My tickets"
      },
      {
       "repo": "toastmanAu/daowow",
       "hash": "7b41092d7f",
       "subject": "fix: review of the ticket cards"
      }
     ]
    },
    {
     "title": "Script group hash is the hash of the whole Script, not the code_hash",
     "lesson": "A script group is identified by BLAKE2b-256 with the 'ckb-default-hash' personalization over the Molecule-encoded Script (code_hash, hash_type byte data=0/type=1/data1=2/data2=4, args). Lock groups come only from inputs. Type groups come from inputs and outputs, and lock and type groups with the same hash stay distinct. Passing the code_hash as the group hash yields ScriptNotFound.",
     "concepts": [
      "Data encoding (molecule, hex, bigints)",
      "Witnesses and signatures"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "1236321f07",
       "subject": "Offer calculated script group candidates"
      }
     ]
    },
    {
     "title": "Check absolute epoch since against the tip before sending",
     "lesson": "A valid transaction is still rejected if an input's since names an epoch the chain has not reached, so compare it with get_tip_header first. A since whose top byte is 0x20 is an absolute epoch lock with the target epoch in its low 24 bits. Compare that against tip.epoch & 0xffffff, because the header epoch is a packed EpochNumberWithFraction.",
     "concepts": [
      "Since and time locks",
      "Data encoding (molecule, hex, bigints)",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "281eb50b10",
       "subject": "feat: settlement operator command and signed-transaction checks"
      }
     ]
    },
    {
     "title": "Preview network spec removed from CKB",
     "lesson": "The preview network is retired and specs/preview.toml has been removed. `ckb init --chain preview` is rejected, and configs using { bundled = \"specs/preview.toml\" } fail to load after upgrading. Point tooling and tests at testnet, staging or dev instead.",
     "concepts": [
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "nervosnetwork/ckb",
       "hash": "36058a4749",
       "subject": "chore: remove preview chain (#5365)"
      }
     ]
    },
    {
     "title": "Compare indexer reads only at the same block",
     "lesson": "When checking consistency between two live-chain reads, such as a list and a detail view, have each response report the block number it was computed at. Compare values only when the blocks match, and re-read on a mismatch instead of failing. Key memo caches by tip block so a cached result never answers from an older block than the rest of the response.",
     "concepts": [
      "Indexer queries and cell collection",
      "Network and RPC reliability",
      "Testing and devnet"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "janx/ckbadger",
       "hash": "f966534b1d",
       "subject": "Merge branch 'fix/verify-asset-list-anchor': a list row and a detail are compared at one block, /assets names the block"
      }
     ]
    },
    {
     "title": "Advancing devnet median time for time-lock tests",
     "lesson": "With the IntegrationTest RPC module enabled, call get_block_template, set current_time (hex ms) to a future value, and submit it with generate_block_with_template, block by block. Since/timestamp checks use the median time, which only moves after many future-dated blocks. Poll get_blockchain_info.median_time until it reaches the target rather than mining one far-future block.",
     "concepts": [
      "Testing and devnet",
      "Since and time locks"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/ckb-revocable-timelock",
       "hash": "d753844282",
       "subject": "scenario: rewrite against the real client API; mining and accelerated chain time through generate_block_with_template; 1"
      }
     ]
    },
    {
     "title": "Reproducing reorgs locally and checking indexer checkpoints by hash",
     "lesson": "Run two dev-chain nodes with IntegrationTest enabled and Discovery removed. Copy shared blocks with submit_block after deleting their hash fields, use add_node/remove_node to split and join the nodes, then mine a longer fork on one so the other switches chains. In indexer tests, compare the checkpoint hash with get_header_by_number(height).hash, since a matching height can sit on an orphaned block.",
     "concepts": [
      "Testing and devnet",
      "Indexer queries and cell collection"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "trungdev26/ckbuilder",
       "hash": "538110ee14",
       "subject": "docs: add Week 8 report and Reorg Lab CLI"
      }
     ]
    },
    {
     "title": "Recompute hashes of RPC views received as input",
     "lesson": "TransactionView and HeaderView carry a derived hash field that an attacker can pair with different content. Recompute it from the molecule-packed struct (e.g. packed::Header::from(h).into_view().hash()), reject any mismatch, and never use the supplied hash as an index.",
     "concepts": [
      "Security hardening",
      "Data encoding (molecule, hex, bigints)"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "Hanssen0-Alter-Ego/ckb-vm-js",
       "hash": "32488ebc54",
       "subject": "Validate optional RPC view hashes"
      }
     ]
    }
   ]
  },
  {
   "area": "Other",
   "summary": "This week's lessons in this area are mostly about building Nervos DAO deposit and withdrawal transactions correctly and keeping every output above its occupied-capacity floor. A smaller group covers authority and validation design for type scripts, including why authority based on one-time-signature locks fails and how output ordering can fool a contract.",
   "lessons": [
    {
     "title": "Occupied capacity minimum for every output",
     "lesson": "Every output needs at least its occupied capacity: (8 bytes for capacity + (33 + args length) for each script + data length) × 10^8 shannons. That is 61 CKB for a plain secp256k1 cell and about 63 CKB for a JoyID lock cell. Set fee or payout constants (for example 65 CKB) above the largest recipient lock's minimum, or the transaction is rejected.",
     "concepts": [
      "Capacity and cell size",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "psawyerberlin/dead-man-switch",
       "hash": "168076140b",
       "subject": "SPEC 2.0: recipients, messenger, fire drill, design; four AIWorker projects"
      },
      {
       "repo": "toastmanAu/daowow",
       "hash": "61246b140b",
       "subject": "feat: claim state, redemption hashes and memento codec, pinned to Rust"
      }
     ]
    },
    {
     "title": "Nervos DAO phase-two withdrawal since and amount",
     "lesson": "Set the phase-two input since to an absolute epoch counted from the DEPOSIT header, not the withdrawing block. Round the elapsed epochs up to whole 180-epoch cycles, compare epoch fractions by cross-multiplication, and keep the deposit's epoch index and length. The withdrawable amount is occupied + (capacity − occupied) × AR_withdraw / AR_deposit, where AR is a little-endian u64 read from bytes 8..16 of each header's dao field. WitnessArgs.input_type must hold the deposit header's index in header_deps as an 8-byte little-endian u64.",
     "concepts": [
      "Since and time locks",
      "Witnesses and signatures",
      "Capacity and cell size"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "89740f6119",
       "subject": "feat: DAO phase two builder"
      }
     ]
    },
    {
     "title": "Nervos DAO phase-one withdrawal layout",
     "lesson": "In phase one, output i must mirror deposit input i (same capacity, lock and DAO type), with its data set to the deposit block number as a u64 LE, and the deposit block hash must be in header_deps. Put any fee-paying input and output after all deposits. A custom lock that enforces a full 180-epoch term before phase one pushes payout to the next cycle boundary (about deposit + 360 epochs, roughly 60 days).",
     "concepts": [
      "Since and time locks",
      "Transaction building and fees",
      "Cell deps and script lookup"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "0b98880b1d",
       "subject": "feat: DAO phase one builder"
      }
     ]
    },
    {
     "title": "Hand-encoding WitnessArgs in molecule",
     "lesson": "WitnessArgs is a molecule table of three BytesOpt fields. An absent field takes zero bytes, but a present empty field still takes a 4-byte length header. The table header is a u32le total size followed by u32le offsets starting at 16. Check any hand-written encoder byte for byte against ccc.WitnessArgs.from(...).toBytes().",
     "concepts": [
      "Data encoding (molecule, hex, bigints)",
      "Witnesses and signatures"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "61246b140b",
       "subject": "feat: claim state, redemption hashes and memento codec, pinned to Rust"
      }
     ]
    },
    {
     "title": "Output ordering and capacity floor for stateful payout cells",
     "lesson": "If a contract finds a participant's payment as the first output under that participant's lock, place payment outputs before the sponsor's change so a sponsor who is also a participant cannot shadow their own payment. A stateful cell that survives a partial payout must keep at least its own occupied capacity (8 + data + lock + type bytes). The builder should hold back the final payment or close the cell exactly, rather than build a transaction that fails on chain.",
     "concepts": [
      "Capacity and cell size",
      "Transaction building and fees",
      "Security hardening"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "toastmanAu/daowow",
       "hash": "367c75153d",
       "subject": "feat: batched payout builder"
      }
     ]
    },
    {
     "title": "Linear authority cell instead of lock.args-based mint authority",
     "lesson": "Owner-mode checks that compare an input's lock.args to the type args break when the lock is a one-time signature scheme such as Lamport. Minting again then means either reusing the key, which allows forgery, or rotating it, which loses mint authority. Bind issuer authority to a linear authority cell that is created at genesis and re-created on each spend with generation+1 under a lock that is free to rotate.",
     "concepts": [
      "Witnesses and signatures",
      "Security hardening",
      "Type ID and upgrades"
     ],
     "status": "current",
     "note": "Both cards come from Noesis, a CKB-inspired chain, so this is a design idea carried over to CKB rather than tested CKB code. Confidence is medium.",
     "sources": [
      {
       "repo": "WGlynn/noesis",
       "hash": "6dad55992a",
       "subject": "One-mint limit: real for the lock.args == args rule; soulbound key chain avoids it"
      },
      {
       "repo": "WGlynn/noesis",
       "hash": "0f92a91ad5",
       "subject": "B1: soulbound identity standard (TokenStandard::Soulbound, wire tag 3)"
      }
     ]
    },
    {
     "title": "Validate every cell against its own script",
     "lesson": "A type script validator that only checks cells of the declared token type lets other cells ride along unchecked. Make sure every input and output is checked by the script for its own code hash.",
     "concepts": [
      "Security hardening"
     ],
     "status": "current",
     "note": "This comes from Noesis, a non-CKB chain, and is only partly applicable. On CKB, each cell's own type script already runs for that cell, so the risk mainly arises in custom aggregate validators.",
     "sources": [
      {
       "repo": "WGlynn/noesis",
       "hash": "0f92a91ad5",
       "subject": "B1: soulbound identity standard (TokenStandard::Soulbound, wire tag 3)"
      }
     ]
    }
   ]
  },
  {
   "area": "Spore and DOB",
   "summary": "This week's Spore lessons are mostly about the cluster lock-proxy mint path in CCC. They cover how to restore the owner/proxy cell correctly when minting spores into a cluster, and how to compare scripts and filters without subtle JS equality bugs.",
   "lessons": [
    {
     "title": "Compare CCC scripts with Script.eq, not ===",
     "lesson": "In CCC, compare ccc.Script values with script.eq(other), never ===. Reference comparison misses identical scripts held in different objects. For example, minting several spores of one cluster in lockProxy mode then adds duplicate cluster-owner outputs.",
     "concepts": [
      "Transaction building and fees",
      "Other"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "9a2d530e48",
       "subject": "fix(spore): accept any owner-lock output for lock-proxy"
      },
      {
       "repo": "ckb-devrel/ccc",
       "hash": "283ca25962",
       "subject": "fix(spore): restore lock-proxy owner by lock, type, and data"
      },
      {
       "repo": "ckb-devrel/ccc",
       "hash": "4982f6c805",
       "subject": "fix(spore): dedupe lock-proxy outputs and honor empty clusterId"
      }
     ]
    },
    {
     "title": "Track restored lock-proxy inputs by outPoint",
     "lesson": "When you spend a lock-proxy or owner cell only to prove ownership (e.g. a Spore cluster lock-proxy), always restore that exact input as an output. Track restored inputs by their outPoint per transaction, so later actions in the same tx reuse the restore and don't add another one. Don't skip the restore because some output already has the same lock, type and data: that output may be an independent payment, and the owner cell would silently become fee change.",
     "concepts": [
      "Transaction building and fees",
      "Capacity and cell size"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "85a6920ef2",
       "subject": "fix(spore): restore lock-proxy by selected input outPoint"
      }
     ]
    },
    {
     "title": "Matching existing outputs to detect a proxy restore",
     "lesson": "An earlier fix detected an already-restored proxy cell by looking for an output that matched it. It first matched on lock alone, comparing with Script.eq. It then matched on lock, type and outputsData, because a newly minted Spore sent to the owner shares the owner's lock and was mistaken for the restore.",
     "concepts": [
      "Transaction building and fees",
      "Other"
     ],
     "status": "superseded",
     "note": "Superseded by outPoint-based tracking (c0123). Even a full lock+type+data match can be an unrelated payment output, which causes the owner cell to be spent as change. Card ids don't confirm chronological order, but c0123 explicitly rejects this matching approach.",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "9a2d530e48",
       "subject": "fix(spore): accept any owner-lock output for lock-proxy"
      },
      {
       "repo": "ckb-devrel/ccc",
       "hash": "283ca25962",
       "subject": "fix(spore): restore lock-proxy owner by lock, type, and data"
      }
     ]
    },
    {
     "title": "Clone cached cell outputs before re-adding them",
     "lesson": "When you add a fetched input cell back as an output, pass cell.cellOutput.clone() rather than the original object. Otherwise later tx edits mutate the cached input cell.",
     "concepts": [
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "9a2d530e48",
       "subject": "fix(spore): accept any owner-lock output for lock-proxy"
      }
     ]
    },
    {
     "title": "Distinguish empty-string clusterId from undefined",
     "lesson": "When filtering spores by an optional clusterId, check clusterId === undefined (no filter) and clusterId === \"\" (public spores only) explicitly. A truthiness check like !clusterId treats \"\" as no filter and returns spores from every cluster.",
     "concepts": [
      "Indexer queries and cell collection",
      "Other"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "4982f6c805",
       "subject": "fix(spore): dedupe lock-proxy outputs and honor empty clusterId"
      }
     ]
    }
   ]
  },
  {
   "area": "RGB++ and Bitcoin",
   "summary": "This week's single lesson covers handling multi-party Bitcoin PSBTs with @scure/btc-signer in CCC's RGB++/Bitcoin signing flow. It is about parsing PSBTs without losing fields and finalizing only your own input when other signers' inputs lack UTXO data.",
   "lessons": [
    {
     "title": "Parsing and partially finalizing multi-party PSBTs with @scure/btc-signer",
     "lesson": "Call `Transaction.fromPSBT(bytes, { unknown: \"ignore\", proprietary: \"ignore\" })`, because the default call loses unknown and proprietary PSBT fields. `finalizeIdx` needs every input's UTXO to check the fee, so it fails when other signers' inputs have no witnessUtxo. To finalize only your own input, copy it into a scratch Transaction and finalize it there. Then clear partialSig, tapKeySig and tapScriptSig, and write finalScriptSig/finalScriptWitness back with updateInput.",
     "concepts": [
      "Witnesses and signatures",
      "Data encoding (molecule, hex, bigints)"
     ],
     "status": "current",
     "note": "The source card has medium confidence. Check the exact behaviour of the unknown/proprietary parse options against the @scure/btc-signer version you use.",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "ff98c8633d",
       "subject": "refactor(btc): replace bitcoinjs-lib with @scure/btc-signer"
      }
     ]
    }
   ]
  },
  {
   "area": "xUDT and tokens",
   "summary": "This week's xUDT lesson is about reading token amounts correctly from cell data. Cells whose data is shorter than 16 bytes hold no valid UDT amount and must be counted as zero when balancing inputs and outputs.",
   "lessons": [
    {
     "title": "Treat UDT cell data shorter than 16 bytes as zero balance",
     "lesson": "A UDT amount is the little-endian uint128 stored in the first 16 bytes of cell data, so any cell with data.length < 16 must count as zero tokens. Parsing short data directly with numFromBytes (for example reading 0x05 as 5) inflates balances and lets input collection such as completeInputsByUdt pick cells that cannot actually fund outputs. Use `data.length < 16 ? Zero : numFromBytes(data.subarray(0, 16))`, which is what CCC's udtBalanceFrom now does.",
     "concepts": [
      "Data encoding (molecule, hex, bigints)",
      "Transaction building and fees"
     ],
     "status": "current",
     "note": "",
     "sources": [
      {
       "repo": "ckb-devrel/ccc",
       "hash": "0337906cdb",
       "subject": "fix(core): exclude incomplete UDT amounts from balances"
      }
     ]
    }
   ]
  }
 ]
}
