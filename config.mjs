// What counts as CKB ecosystem activity, and how often to look.

// Organisations whose public events are read every minute (checked 2026-10-09: all have recent public events
// except sporeprotocol, cryptape and utxostack, which exist but were quiet).
// People and teams followed like organisations, through their public feed and public repositories only
export const USERS = ['LusoCryptoLabs']

export const ORGS = [
  'nervosnetwork', 'ckb-devrel', 'Nervos-Community-Catalyst', 'nervina-labs', 'magickbase', 'ckb-js',
  'sporeprotocol', 'cryptape', 'utxostack',
]

// Builders: repositories outside those organisations that depend on CKB libraries or carry CKB topics.
// Code search is precise (a dependency in a manifest); topic search catches repos that declare themselves.
export const CODE_SEARCHES = [
  '"@ckb-ccc/core" filename:package.json',
  '"@ckb-ccc/connector-react" filename:package.json',
  '"@spore-sdk/core" filename:package.json',
  '"@rgbpp-sdk/ckb" filename:package.json',
  '"@ckb-lumos/lumos" filename:package.json',
  '"ckb-std" filename:Cargo.toml',
  '"ckb-sdk" filename:Cargo.toml',
  // added 2026-10-10, each measured to find projects (matches then): the other CCC and Lumos packages, JoyID, the old
  // JS SDK, the JS VM library, Go and Java SDKs, and the Rust crates contracts and their tests use
  '"@ckb-ccc/ccc" filename:package.json', // 51
  '"@ckb-ccc/shell" filename:package.json', // 14
  '"@ckb-ccc/connector" filename:package.json', // 99
  '"@ckb-lumos/base" filename:package.json', // 165
  '"@ckb-lumos/helpers" filename:package.json', // 86
  '"@rgbpp-sdk/btc" filename:package.json', // 11
  '"@joyid/ckb" filename:package.json', // 36
  '"@nervosnetwork/ckb-sdk-core" filename:package.json', // 83
  '"@ckb-js-std/core" filename:package.json', // 68
  '"ckb-sdk-go" filename:go.mod', // 41
  '"org.nervos.ckb" filename:pom.xml', // 7
  '"ckb-types" filename:Cargo.toml', // 525
  '"ckb-testtool" filename:Cargo.toml', // 189
]
export const TOPIC_SEARCHES = ['topic:ckb', 'topic:nervos', 'topic:nervos-network', 'topic:nervos-ckb', 'topic:ckb-blockchain', 'topic:spore-protocol', 'topic:rgbpp', 'topic:fiber-network', 'topic:ckb-contract', 'topic:ckb-script', 'topic:nervos-dao', 'topic:joyid']

// Owners never shown, whatever discovery or a suggestion finds (GitHub logins, any case)
export const BLOCKED = []

// Vetting an owner nobody listed (found among the people at work, or suggested on the page): it joins when it has a
// public repository pushed in the last 30 days that is plainly CKB work, by topic, by name or description, or (for
// suggestions) by a CKB dependency found with code search. "fiber" and "ccc" alone are too common elsewhere.
export const VET_TOPICS = ['ckb', 'nervos', 'nervos-network', 'nervos-ckb', 'ckb-blockchain', 'spore', 'spore-protocol', 'rgbpp', 'fiber-network', 'ckb-fiber']
export const VET_TEXT = /\bckb|nervos|rgb\+\+|rgbpp|spore protocol|spore-sdk/i
// "ckb" alone is not enough: it is also Central Kurdish and, since 2026, "Codebase Knowledge Base" (a Claude Code plugin
// tagged ckb was listed as a new CKB project on 2026-10-09). A repository found only through the ckb topic, or naming
// ckb and nothing else, needs one of these words in its name, description or topics.
export const CKB_CONTEXT = /nervos|blockchain|\bcell|\budt\b|\bxudt\b|spore|\bdob\b|rgb\+\+|rgbpp|fiber|\bccc\b|lumos|joyid|godwoken|\bdao\b|layer ?1|\bl1\b|wallet|crypto|token|\bnft|smart contract|testnet|mainnet|on-?chain|lock script|type script|ckb-vm|riscv|risc-v/i
export const CKB_NOT = /knowledge base|kurdish|sorani|kurd/i

export const VET = { activeDays: 30, maxRepos: 20, perIpPerHour: 5, allPerHour: 40, recheckDays: 7, crawlPerCycle: 60 }

// Keyword tags. Every repo here is already CKB context, so "fiber" and "dob" are safe inside it; on their own
// across GitHub they are mostly noise (React Fiber, Go Fiber, "dob" as date of birth), measured 2026-10-09.
export const TAGS = {
  ckb: /\bckb\b/i,
  fiber: /\bfiber\b|\bfnn\b/i,
  'dob/spore': /\bdob\d*\b|\bspore\b|\bcluster\b/i,
  'rgb++': /rgb\+\+|rgbpp|\butxostack\b/i,
  ccc: /\bccc\b/i,
  nervos: /nervos/i,
}

export const POLL = {
  orgsEverySec: 60, // GitHub asks for X-Poll-Interval 60 on org events
  buildersCycleMin: 10, // every builder repo is checked once per cycle, spread evenly
  discoverEveryHours: 6,
  keepDays: 30,
  maxEvents: 12000,
}

// Automation: kept as quiet sparks on the grid, never in the feed or the main counters (releases excepted)
export const isNoiseActor = (login) => /\[bot\]$/i.test(login) || login === 'Copilot'
// AI agents working under a person's account push to branches of their own (Claude Code, Codex, Copilot, Cursor,
// Devin). Their pushes, the branches they open and the pull requests they propose count as automatic; the person who
// merges the work still counts. Measured 2026-10-10 on the lab's 30 days: 60 such events among about 2,260 by people.
export const AGENT_BRANCH = /^(claude|codex|copilot|cursor|devin)\//i
export const isAgentBranch = (ref) => AGENT_BRANCH.test(ref || '')
// A schedule, not a person: one account pushing the same commit title to one project on this many different days of
// the last 30. Measured 2026-10-10: two accounts pushed "Update README.md" every two hours or so on 20 of 29 days (100
// pushes each) and led the month's people; the most a person repeated a title was on 12 days (uploads from the web).
export const SCHEDULE_DAYS = 15
