import { useState, useEffect, useRef, useCallback, Component } from "react";

// L-04 FIX: Error Boundary prevents white-screen crashes
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(e, info) { if (typeof window !== "undefined" && (window.location?.hostname === "localhost")) console.error("[ErrorBoundary]", e, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{minHeight:"100vh",background:"#08070a",color:"#c4b5fd",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Crimson Pro',serif",padding:40,textAlign:"center"}}>
          <div style={{fontSize:52,marginBottom:16}}>🐺</div>
          <div style={{fontSize:22,fontFamily:"'Cinzel',serif",fontWeight:700,letterSpacing:3,marginBottom:12}}>LONE WOLF DOWN</div>
          <div style={{fontSize:14,color:"#6b7280",maxWidth:400,lineHeight:1.7}}>Something went wrong. Try refreshing the page.</div>
          <div style={{fontSize:10,color:"#374151",marginTop:12,fontFamily:"monospace",maxWidth:500,wordBreak:"break-all"}}>{this.state.error?.message}</div>
          <button onClick={()=>window.location.reload()} style={{marginTop:20,padding:"10px 24px",background:"rgba(139,92,246,.1)",border:"1px solid rgba(139,92,246,.3)",borderRadius:8,color:"#c4b5fd",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:2}}>RELOAD</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Payment recipient address (public — assembled from parts for readability only)
const _a = ["bc1pgcqny", "setzcufk3", "ytpwxq24z", "r59frluqy", "fyg270kkv", "8njwkzqge", "kqh7mg0g"];
const _getRecipient = () => _a.join("");
// Whitelist: owner wallet gets free access — everyone else pays
const _wl = ["bc1pgcqnysetzcufk3ytpwxq24zr59frluqyfyg270kkv8njwkzqgekqh7mg0g"];
const isWhitelisted = (addr) => _wl.includes(addr?.toLowerCase?.() || addr);
// Access fee: ~$30 at BTC ~$100k = 30,000 sats. Pay once, access forever.
const ACCESS_FEE_BTC_SATS = 30000n;
// MOTO fee: 500 MOTO (8 decimals = 500_00000000). Adjust as MOTO price changes.
const ACCESS_FEE_MOTO = 50000000000n; // 500 MOTO
const ACCESS_FEE_MOTO_DISPLAY = "500";
const ACCESS_FEE_DISPLAY = "$30";
// Access stored in localStorage by wallet address — permanent, survives sessions
// C-03 NOTE: This is a client-side soft gate (honor system). A determined user
// can bypass via DevTools. For hard enforcement, add server-side verification.
const ACCESS_KEY = (addr) => `lw_paid_${btoa(`lw_access_${addr}`).replace(/=/g, "")}`;

// ─── OPNet / Bitcoin config ───────────────────────────────────────────────────
// H-03 FIX: Debug logging gated behind flag — off in production
const DEBUG = typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.search?.includes("debug=1"));
const log = (...a) => { if (DEBUG) log(...a); };
const warn = (...a) => { if (DEBUG) warn(...a); };
const err = (...a) => { if (DEBUG) err(...a); };

const RPC          = "https://mainnet.opnet.org";
const MEMPOOL_TX   = "https://mempool.space/tx/";
const MEMPOOL_ADDR = "https://mempool.space/address/";

// L-01 FIX: All tunable constants in one place
const CONFIG = {
  SCAN_INTERVAL:     18000,   // Auto-scan interval (ms)
  BLOCK_SCAN_BATCH:  5,       // Blocks per batch in block scanner
  BLOCK_SCAN_DELAY:  300,     // Delay between block scan batches (ms)
  BALANCE_BATCH:     10,      // Wallets per balance fetch batch
  BALANCE_DELAY:     400,     // Delay between balance batches (ms)
  TX_LIMIT:          50,      // Max txs to fetch per mempool scan
  SNIPER_MAX:        200,     // Max sniper alerts retained
  ALERTS_MAX:        300,     // Max wolf alerts retained
  INTERACTIONS_MAX:  500,     // Max trail interactions retained
  PATTERNS_MAX:      50,      // Max pattern signals retained
  RPC_TIMEOUT:       15000,   // RPC call timeout (ms)
  BLOCK_POLL:        15000,   // Block height poll interval (ms)
  PATTERN_WINDOW:    600000,  // Pattern detection window (10 min)
  WOLF_LINK_PRUNE:   500,     // Prune wolf links above this count
  WOLF_LINK_MAX_AGE: 3600000, // Max age for wolf link entries (1 hr)
};
const SCAN_INTERVAL = CONFIG.SCAN_INTERVAL;
const BLOCK_SCAN_BATCH = CONFIG.BLOCK_SCAN_BATCH;
const CONTRACTS = {
  MOTO:    "0x75bd98b086b71010448ec5722b6020ce1e0f2c09f5d680c84059db1295948cf8",
  STAKING: "0xaccca433aec3878ebc041cde2a1a2656f928cc404377ebd8339f0bf2cdd66cbe",
  SWAP:    "0x035884f9ac2b6ae75d7778553e7d447899e9a82e247d7ced48f22aa102681e70",
  BURN:    "bc1purcd6qm3emx2vyvd2qyq9nagx7lwdy83qyyn4stj3amajsxjyjuq45wk73",
  // NativeSwap is the same as SWAP — handles BTC<->token pools
  NATIVE_SWAP: "0x035884f9ac2b6ae75d7778553e7d447899e9a82e247d7ced48f22aa102681e70",
};

// ─── DAPP LINKS ──────────────────────────────────────────────────────────────
const DAPP_LINKS = {
  MOTOSWAP:      "https://motoswap.org",
  MOTOSWAP_SWAP: "https://motoswap.org/swap",
  MOTOSWAP_POOL: "https://motoswap.org/pool",
  MOTOCHEF:      "https://farm.motoswap.org",
  OPNET_PORTAL:  "https://opnet.org/portal",
  NATIVE_SWAP:   "https://motoswap.org/native-swap",
  ICHIGAI:       "https://future.ichigai.io",
  OP_SCAN:       "https://opscan.org",
  OPTRACK:       "https://www.optrack.org",
  OPNET_DOCS:    "https://docs.opnet.org",
};

// H-04 FIX: Safe bigint-to-number conversion with bounds check
const MAX_SAFE_SATS = BigInt(Number.MAX_SAFE_INTEGER);
function safeToNumber(val) {
  const b = typeof val === "bigint" ? val : BigInt(val);
  if (b > MAX_SAFE_SATS) throw new Error(`Amount ${b} exceeds safe integer range`);
  return Number(b);
}

// Clipboard copy with visual feedback
async function copyToClipboard(text, el) {
  try {
    await navigator.clipboard.writeText(text);
    if (el) { const prev = el.textContent; el.textContent = "✓ Copied!"; setTimeout(() => { el.textContent = prev; }, 1200); }
    return true;
  } catch {
    // Fallback for older browsers
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    if (el) { const prev = el.textContent; el.textContent = "✓ Copied!"; setTimeout(() => { el.textContent = prev; }, 1200); }
    return true;
  }
}

// ─── TIERS ────────────────────────────────────────────────────────────────────
const TIERS = [
  { id:"dust",    min:0,             max:50_000_000,    label:"DUST",    icon:"💨", color:"#4a5568" },
  { id:"shrimp",  min:50_000_000,    max:100_000_000,   label:"SHRIMP",  icon:"🦐", color:"#718096" },
  { id:"fish",    min:100_000_000,   max:500_000_000,   label:"FISH",    icon:"🐟", color:"#63b3ed" },
  { id:"dolphin", min:500_000_000,   max:1_000_000_000, label:"DOLPHIN", icon:"🐬", color:"#68d391" },
  { id:"shark",   min:1_000_000_000, max:5_000_000_000, label:"SHARK",   icon:"🦈", color:"#f6ad55" },
  { id:"whale",   min:5_000_000_000, max:Infinity,      label:"WHALE",   icon:"🐳", color:"#b794f4" },
];
const getTier = (s) => { const n=parseInt(s,10)||0; return TIERS.find(t=>n>=t.min&&n<t.max)||TIERS[0]; };

// ─── TAGS ─────────────────────────────────────────────────────────────────────
// All wallets are future MOTO OG holders (airdrop recipients at mainnet launch)
// Tags reflect origin/role — not a ranking or category split
const TAGS = {
  moto_holder: { icon:"🐺", color:"#f6ad55",  label:"OG WOLF"  },
  moto_burner: { icon:"🍊", color:"#fc8181",  label:"PILL WOLF" },
  motocat:     { icon:"🐱", color:"#b794f4",  label:"CAT WOLF" },
  protocol:    { icon:"⚙️", color:"#68d391",  label:"TEAM"     },
  linked:      { icon:"🔗", color:"#f59e0b",  label:"LINKED"   },
  new:         { icon:"🆕", color:"#76e4f7",  label:"FOUND"    },
  custom:      { icon:"👤", color:"#a0aec0",  label:"TRACKED"  },
};

// ─── PATTERNS ─────────────────────────────────────────────────────────────────
const PATTERNS = {
  MASS_BUY:    { label:"🐺 Pack Hunt",      color:"#68d391", desc:"≥3 wolves buying same project" },
  FARM_MOVE:   { label:"🌿 Den Shift",       color:"#f6ad55", desc:"Pack migrating to new farm/stake" },
  BURN_WAVE:   { label:"🔥 Offering",        color:"#fc8181", desc:"Multiple wolves burning MOTO" },
  DEPLOY_WATCH:{ label:"🐾 New Territory",   color:"#76e4f7", desc:"Wolf deployed new contract" },
  ACCUMULATE:  { label:"📦 Hoarding",        color:"#b794f4", desc:"Single wolf accumulating fast" },
  COORDINATED: { label:"🐺 Coordinated",     color:"#f6ad55", desc:"Pack sending to same destination" },
  LINKED_WALLET:{ label:"🔗 Linked Wallet",  color:"#f59e0b", desc:"Probable secondary wallet of a tracked wolf" },
  NEW_POOL:    { label:"💎 New Pool",        color:"#22d3ee", desc:"New liquidity pool created on MotoSwap" },
  LIQ_ADD:     { label:"💧 Liquidity Added", color:"#06b6d4", desc:"Liquidity injection detected — early entry window" },
  EARLY_LP:    { label:"🎯 Sniper Signal",   color:"#10b981", desc:"Wolf adding liquidity to fresh pool — ape opportunity" },
};

// ─── 117 MOTO WALLETS ─────────────────────────────────────────────────────────
const RAW_WALLETS = [
  { address:"bc1purcd6qm3emx2vyvd2qyq9nagx7lwdy83qyyn4stj3amajsxjyjuq45wk73", label:"OrangePill Burn Vault", tag:"moto_burner" },
  { address:"bc1ptffmlqtltc9ws65ekvdrs284ar5l4cak0cg8ayfar76zjvj6448su6e0ps", label:"Burner Wolf #2",  tag:"moto_burner" },
  { address:"bc1ppj4csc8t2yarx486wm0jn8mhuwhhmk2chmtgqwce96w07rzakkmq9j9caq", label:"Burner Wolf #3",  tag:"moto_burner" },
  { address:"bc1p9s3gwutdya06vd8vhgaq797wtagvgwgps8tmg3kvnels7c7da48sze3mjg",  label:"Burner Wolf #4",  tag:"moto_burner" },
  { address:"bc1pjrly8q6yje2tmzl3qzjla0cyljwrlxyh8rd8g9kxjcnmskz9xvpshmuz47", label:"Burner Wolf #5",  tag:"moto_burner" },
  { address:"bc1q0n3xt8e8fkm0j6389m9cf5pafzg2hjqlkdm6f9",                      label:"Burner Wolf #6",  tag:"moto_burner" },
  { address:"bc1p0q2qz2n7uq62c255neycdpp7qz3uwyxeaej8jqveaefq2m5q8r6snajmnu", label:"Burner Wolf #7",  tag:"moto_burner" },
  { address:"bc1prwcjqrja55gcu3gys37vr85a68ra2ltmkqy8ug5sdyw82u6x8vzqe8qg9t", label:"Burner Wolf #8",  tag:"moto_burner" },
  { address:"bc1pq0l2ae04u5jnj8r3mga4g6gzy5ewvtp8tps83e722cxcg6ag3cusjlp5s6", label:"Burner Wolf #9",  tag:"moto_burner" },
  { address:"bc1pcatpzu6hsq6tt9vj5z57nwj446r6vlajcukxsrg86m7nsr0r67zqmrh29q", label:"Burner Wolf #10", tag:"moto_burner" },
  { address:"bc1p96sgjxjuckpl0urvj6as48k0z4gzk5jn32g4uwqh59j7helu557skfe5qe", label:"Burner Wolf #11", tag:"moto_burner" },
  { address:"bc1qxwd0pz2ll6ml43ln9yypvxcn72ge2z54wz5k8x",                      label:"Burner Wolf #12", tag:"moto_burner" },
  { address:"bc1qkvh30rh93re69m8wnq47efxl0je0z3pqlnl0fm",                      label:"Burner Wolf #13", tag:"moto_burner" },
  { address:"bc1p3sgt8gz3ayrana540rgr4ken6p0pq9q8u37xyfrgrhtm2gutznpqlf8336", label:"Burner Wolf #14", tag:"moto_burner" },
  { address:"bc1q9vsj5fm0dt7jg3c6sdxkemdy0q57ty2agv20u5",                      label:"Burner Wolf #15", tag:"moto_burner" },
  { address:"bc1q74vlwqj0p9qr5k033wzm9urktpsqkq5j24atxe",                      label:"Burner Wolf #16", tag:"moto_burner" },
  { address:"bc1pf8snlj5jqlgdzjq76e8sjef3jx2hsgkh3xj630y0kl788v579vzslhx9m9", label:"Burner Wolf #17", tag:"moto_burner" },
  { address:"bc1pu7jw9mnu98c058pf2fmuprez2gas0749u5crp0dqv9e2urndrtyqw62fjk", label:"Burner Wolf #18", tag:"moto_burner" },
  { address:"bc1p4tq4elntkxc0s6h0xgs8kf2yx2q2dvs3dkmfm9nzmmared3wucvqzv4cmu", label:"Burner Wolf #19", tag:"moto_burner" },
  { address:"bc1pe2xr676q9sx85vkl0yr6zut75yenfq8rz9l90wa94lv058pr5wtsc2f4j5", label:"Burner Wolf #20", tag:"moto_burner" },
  { address:"bc1pfex86ucm9geq80802d39dasu7jxysh5taw6k4eykzj7wnrtljt0shn9xmq", label:"Pack Wolf #21",   tag:"moto_holder" },
  { address:"bc1p05zc2vdkrz9pcmrdk0fktmgf3av2dhdvak5xpfd7dmemwnlvg7dsc43xzn", label:"Pack Wolf #22",   tag:"moto_holder" },
  { address:"bc1p4nqxx577k04d045mykkzpg89swrk234lpfjkef4erpdgkkc7994qvnvddm",  label:"Pack Wolf #23",   tag:"moto_holder" },
  { address:"bc1pj9j7wmm0ff7yal0p3suj6rpycvm43z4lv7yjear8mkfxglaxfjeqvz3a6c", label:"Pack Wolf #24",   tag:"moto_holder" },
  { address:"bc1pmjykveg4uaqsgn65vnd5e45x3syru5eyssjagr4tqjuzuyyc8r0q4t3z4k", label:"Pack Wolf #25",   tag:"moto_holder" },
  { address:"bc1pcmhm8gqq37acl2wngn4e23aejltrnnqkx8gwfzxp5ga9rvf9048sf7p3pt", label:"Pack Wolf #26",   tag:"moto_holder" },
  { address:"bc1p83400eut2rwc8ex4duk36cr5pk9el8x4lrzmen8vdeeqkqvfqryswny52m", label:"Pack Wolf #27",   tag:"moto_holder" },
  { address:"bc1pqclpdy0akzrk2e02nccycyf26fcfzh2ynqkz36sw8h9tfztlttdsa5gr98", label:"Pack Wolf #28",   tag:"moto_holder" },
  { address:"bc1puslmcy24pd4ef9lzqzxu3kwl7u4zl7h620wlxfyeuj7keku9fgrqalvrla", label:"Pack Wolf #29",   tag:"moto_holder" },
  { address:"bc1p2upqjg2x63008f76dxz2ru50s0pz0wvu89c4k9zgs8zsr3cc636qvhj44w", label:"Pack Wolf #30",   tag:"moto_holder" },
  { address:"bc1pdnp0s269cht5lgy9a444xwahvnyvj2q7xsgzpre5mke7244nsy4quftfjm",  label:"Pack Wolf #31",   tag:"moto_holder" },
  { address:"bc1p2dtemgfd5020kyancwxzmkcunprx2vrk3cxhfn939ep0h9t43x9s3dud3z", label:"Pack Wolf #32",   tag:"moto_holder" },
  { address:"bc1ph8w37wrhx7y6enjal3g24q2eychmgdrc42jgnqey9wl9f72e5e0sdl0ues", label:"Pack Wolf #33",   tag:"moto_holder" },
  { address:"bc1p84ks48fkxdux645r0k9f0ygandqdhfpmfntdm4l2frsx95jlcgrqt894lq", label:"Pack Wolf #34",   tag:"moto_holder" },
  { address:"bc1pt5uykt7vt6gqwu7ejxgj7al4qp4z5wmutkgnh444kq4gxzrm4xkqahs2pm", label:"Pack Wolf #35",   tag:"moto_holder" },
  { address:"bc1phqglfz5akpu7x6l3nrdflxm7fz284xxmvs4c93hgsxuanxj6emmqc2det3", label:"Pack Wolf #36",   tag:"moto_holder" },
  { address:"bc1pxcjhlkmugdehl5neugxkca9q7fkrzxy95clx5zzqwzt87lhcmaes603m4l", label:"Pack Wolf #37",   tag:"moto_holder" },
  { address:"bc1q8qll9y7hywluyg648gpm9e830el7zsmut2etdm",                      label:"Pack Wolf #38",   tag:"moto_holder" },
  { address:"bc1pu3ferhnpzgcceskcezktfq0gm0mg0ljajhh3rsu35f5zs6v9wghs3y6j9f", label:"Pack Wolf #39",   tag:"moto_holder" },
  { address:"bc1p2zsg27uztxvajjtyynsujchhypdpk92zsymkv09k8avtyxkuh90qhs02up",  label:"Pack Wolf #40",   tag:"moto_holder" },
  { address:"bc1p3rwxaf7tsk4kwk6em5a2wggazs7ejf9ex80jadapp8dnp8l57f9qhmvjfq", label:"Pack Wolf #41",   tag:"moto_holder" },
  { address:"bc1pp9u4qkwfqcf9pkt0e3lfvuesnjcj45cp69az9gs3f7ymgljd4p8qcaxllv", label:"Pack Wolf #42",   tag:"moto_holder" },
  { address:"bc1psf4sh7c88yak9xhm68tyr73ydetem0z3v3x8hrv6rqu3sdn7yndsjjd7rk", label:"Pack Wolf #43",   tag:"moto_holder" },
  { address:"bc1pau9uxy5tpu8p974lttk4pksz3wj23adw0rrver2jq8972w33xecsc9t0g4", label:"Pack Wolf #44",   tag:"moto_holder" },
  { address:"bc1q8qpm2y2pc2hjk60guxtf2dtcq9lvj06uhtajhu",                      label:"Pack Wolf #45",   tag:"moto_holder" },
  { address:"bc1pyqlmlvju0cwfnjfqmww5nm7mkkfwww6ajeqlw8anvjc06t5dk86qpp4w6s", label:"Pack Wolf #46",   tag:"moto_holder" },
  { address:"bc1q92342jn2dzwgsz934myvdrw8l0wujdcsygk0gm",                      label:"Pack Wolf #47",   tag:"moto_holder" },
  { address:"bc1q7nqpve9lhgq6xhdafr8ww5kmzjvpg9q9lkqqul",                      label:"Pack Wolf #48",   tag:"moto_holder" },
  { address:"bc1ptkz8lhvqvl7suled2mkkr078c4xh5vmvlzeyhkphm4k8p7spyhvsa3zw7d", label:"Pack Wolf #49",   tag:"moto_holder" },
  { address:"bc1p7w69r4jvw5ulpmze8y9cpg95cjr97e0mf9zn5l396f0r5md4xe9s0jgdy6", label:"Pack Wolf #50",   tag:"moto_holder" },
  { address:"bc1pefhzyhpt5ylplgs5a3v8eqh9s5k3zrcvn8ra5l6l8t9yrcr4v8tqe2nadp", label:"Pack Wolf #51",   tag:"moto_holder" },
  { address:"bc1q7xu2caspgg7x2qxxy9zzajnwvsw4yx60ttrtjd",                      label:"Pack Wolf #52",   tag:"moto_holder" },
  { address:"bc1p45njjm0q0wg2uvphht5yucyyha58q2vcfuwfvgufqq4zc698jpqqeggqaz", label:"Pack Wolf #53",   tag:"moto_holder" },
  { address:"bc1pdr8m4ntncu4j82q60xrg56ujky6pxgacz0u5hgylmhuyvezr3k2qkv9jxd", label:"Pack Wolf #54",   tag:"moto_holder" },
  { address:"bc1pc0zmm6vsjn3s73affxn2efwufq8myt6stqdny62avxdg9c08spfqrcc275", label:"Pack Wolf #55",   tag:"moto_holder" },
  { address:"bc1pjctfs5r50kuwjyvgv72494hw3pt68smw89yayh6ngp0d97646rjqxqgtjl", label:"Pack Wolf #56",   tag:"moto_holder" },
  { address:"bc1p8d2nshkplsq0tpqpy3jq7qs393292mml4l6k4qgu3kwnjj388amqxky0e9", label:"Pack Wolf #57",   tag:"moto_holder" },
  { address:"bc1pn8ez4qpdswmyv2g7rkj4gj6ulss84srehx00hspg6544vg5p7yus04wanl", label:"Pack Wolf #58",   tag:"moto_holder" },
  { address:"bc1qf4405fn9m95c6pp3xzc535dzp67y4p0lswzurs",                      label:"Pack Wolf #59",   tag:"moto_holder" },
  { address:"bc1plmjanl9tdveqmgjcerte4t0nk0pv7407u4ez3ytvpakl3vwgcseqs3vl50", label:"Pack Wolf #60",   tag:"moto_holder" },
  { address:"bc1ple9m27v54zavqd2sdsxgp52we2mczcfh3e6jhc6rpn0s7fu0jx6qkzqssd", label:"Pack Wolf #61",   tag:"moto_holder" },
  { address:"bc1p4mjn7h433e4h94hkmvkvx7gh23qe487864pllff2569dnc2rmmcsm4ndwf", label:"Pack Wolf #62",   tag:"moto_holder" },
  { address:"bc1q5kh2sgc2sgkzegkap9ltdejdl50z3drfy2mvg2",                      label:"Pack Wolf #63",   tag:"moto_holder" },
  { address:"bc1p7p9e5jdevx678gnd42dpd5ffju8u88hptzthct3td5cz3jqdnszst9dm9c", label:"Pack Wolf #64",   tag:"moto_holder" },
  { address:"bc1p9fuutqeup2p3c4jylqwey7hf6lsaxdezp70fqyfu3ga6er3jef2s0qt7la", label:"Pack Wolf #65",   tag:"moto_holder" },
  { address:"bc1p0k9rkmtllmlwfmegjap5mdtrpn07qshv4hrewtc4rqtqupv43s8s9vdyqs", label:"Pack Wolf #66",   tag:"moto_holder" },
  { address:"bc1qvtrn7yzy5z3j28d8wgrd8mr89hla3gdmuypc02",                      label:"Pack Wolf #67",   tag:"moto_holder" },
  { address:"bc1p0e4q6ev44a3uugwjzeh7znvh72gutkc30cgjq3zzjgjwynv9l33sxnm2kl", label:"Pack Wolf #68",   tag:"moto_holder" },
  { address:"bc1q8p0c8fzsgh8eeryf7wdy9vqw65vex4y2srfjv4",                      label:"Pack Wolf #69",   tag:"moto_holder" },
  { address:"bc1qtk8r3dzda0cwz5kvy2kz04gvdaxpghg0kq98js",                      label:"Pack Wolf #70",   tag:"moto_holder" },
  { address:"bc1pl44skrscxeqhuhx672gvlzapl2le4zyfnklnwm66xw7s3ka6an8sqpjn53", label:"Pack Wolf #71",   tag:"moto_holder" },
  { address:"bc1pwzypyk6lpcc46mqrvpq5stsvekjzg6cgl9mxdh3qc3z74ecdlyqqxck6c6", label:"Pack Wolf #72",   tag:"moto_holder" },
  { address:"bc1pe47te2jqq0q8wczx790vzevdc9z9v8wcvsg4tut0c8gh4l85zcwq629h99", label:"Pack Wolf #73",   tag:"moto_holder" },
  { address:"bc1p5jazuyfsznvgqvjm2pzfk0ayxllu0afkgg0a2zyxya676fq8ncjs3y3wdp", label:"Pack Wolf #74",   tag:"moto_holder" },
  { address:"bc1plqjh3g28rd4wsflc0zadm7ekrc7gdjn37lpv2nx6hef2u4kv252q0wfms6", label:"Pack Wolf #75",   tag:"moto_holder" },
  { address:"bc1pc3u0xvq4caartgywl3e8egfa3cn02dvsee2g3m2anv4cpjryjuysm4mz64", label:"Pack Wolf #76",   tag:"moto_holder" },
  { address:"bc1ppdf7r4ynlx8m574l6c4vwhdywre2ym8uwrk3r9xgzejf985k6mfqzw0xlh", label:"Pack Wolf #77",   tag:"moto_holder" },
  { address:"bc1q9vwze6c549mekfhhrdzxsv2d0aa8eefa3zzx50",                      label:"Pack Wolf #78",   tag:"moto_holder" },
  { address:"bc1p8vpgqq862v743tehjp8jy4pu69gaz2v8q9at070exnv04m7rr8qq0ekn8z", label:"Pack Wolf #79",   tag:"moto_holder" },
  { address:"bc1pgfwternfdxyre779cwghswp3jaj6txq39un942jd97fn897tajfq89aucq",  label:"Pack Wolf #80",   tag:"moto_holder" },
  { address:"bc1quykmcvuuwdjwjxm39axy58qx0wvr88tu3zjkjc",                      label:"Pack Wolf #81",   tag:"moto_holder" },
  { address:"bc1pernve0akx3lz2gfmetlktf808465r3jgrxahqks603whrnmp35usc3lsde", label:"Pack Wolf #82",   tag:"moto_holder" },
  { address:"bc1pxdqk5xvlhfrmag4uerxr8r89avfur6xg79h2zxfvdgpjky59ufrq8ffsns", label:"Pack Wolf #83",   tag:"moto_holder" },
  { address:"bc1p52c47pp2vrv6we77rwam6ufk530uke0tt30g64vfuyzpwswtx7gqm7wz2m", label:"Pack Wolf #84",   tag:"moto_holder" },
  { address:"bc1p6evx0gyehrx8wlslx9m5fhyn2un00m23r6whamfqftrztpxeyl8sdhnc5v", label:"Pack Wolf #85",   tag:"moto_holder" },
  { address:"bc1pza8zfnelymq8edehynd8zxdf89cmc3e43evuclc8c607y0fcz8hsqet8u6", label:"Pack Wolf #86",   tag:"moto_holder" },
  { address:"bc1ppushax747ur838ktauspsg0x8lzg6p5nvvxtdpjwg56awtf4lq9qhr0jjt", label:"Pack Wolf #87",   tag:"moto_holder" },
  { address:"bc1pk846qzc44awln7skktln8p2fh6vu2drzyp3qpette9jzwvs74fmqss67pr", label:"Pack Wolf #88",   tag:"moto_holder" },
  { address:"bc1q8jpkg5uw6kx96y6jzen2ryrp2rn2xpdh6n3zm2",                      label:"Pack Wolf #89",   tag:"moto_holder" },
  { address:"bc1pylhtzcjd9vjw8xh4zcc8lqn5uteyyj7f73fl7yet5lf5qme24keqau6fwd", label:"Pack Wolf #90",   tag:"moto_holder" },
  { address:"bc1q4znymaf6l8y59x55qhzqzd02awq7a55tr7yn0a",                      label:"Pack Wolf #91",   tag:"moto_holder" },
  { address:"bc1pp0xv9q5r0pwww7wk5vaa5zrgmvxfcud9ud6jjx4smn2f5t7lxfxshasp6f", label:"Pack Wolf #92",   tag:"moto_holder" },
  { address:"bc1qcmc3rcjpx3zkenr68tldev42unck09dx0nhz5f",                      label:"Pack Wolf #93",   tag:"moto_holder" },
  { address:"bc1pvmwxvl6dre5agw0424vt03396v2a6wwgxjjlcp7qmnuze4xdauaqkffg5r", label:"Pack Wolf #94",   tag:"moto_holder" },
  { address:"bc1p4tyryzmlp3w4gjhldp2rze043vwrdfagllqp8rzlqwxrap9vvjgq07k5xm", label:"Pack Wolf #95",   tag:"moto_holder" },
  { address:"bc1q60tq6kfnk9dzkrk8l9dnw4vchkenru27tc4ftj",                      label:"Pack Wolf #96",   tag:"moto_holder" },
  { address:"bc1q7qwr9k9sq07wkq43ljz3uxn73g2pd90nr2es8p",                      label:"Pack Wolf #97",   tag:"moto_holder" },
  { address:"bc1pcpcvwsxcjgrph7q4hjr6f46x53z07u7t60jzuvx3wnua3s6ezpastpsd7u", label:"Pack Wolf #98",   tag:"moto_holder" },
  { address:"bc1qd2frkqe3fhtd5suvdytfpjjdt5gs79vuds6n6e",                      label:"Pack Wolf #99",   tag:"moto_holder" },
  { address:"bc1p4f8k4e2fczq43nhvfxejz73pkqrr2ddzgpdytu5f4x0zx46wj29s3mny7r", label:"Pack Wolf #100",  tag:"moto_holder" },
  { address:"bc1q76av53ckfh8kaq5xu0s0zv362ktz39eyw3s5qz",                      label:"Pack Wolf #101",  tag:"moto_holder" },
  { address:"bc1qqrcs537vwmvjwqa3ffk5n6v7j8ecwxhvu3m0f8",                      label:"Pack Wolf #102",  tag:"moto_holder" },
  { address:"bc1pkh467aetw6cq4fk6fxg0mxeanca959klyzut6l47e8zwlvukekmqmd028u", label:"Pack Wolf #103",  tag:"moto_holder" },
  { address:"bc1qkrcm3nt6wq7qfw0lqxzj7t9su8864klkqp8xh2",                      label:"Pack Wolf #104",  tag:"moto_holder" },
  { address:"bc1plx7d3fh69mjyrz6pws4djrgf7chqhs99pq9a9qug2tyh4llzulnss9w506", label:"Pack Wolf #105",  tag:"moto_holder" },
  { address:"bc1pxn6nqfex7ulvxw5tz736ptzs363teekggup2humhhzu75nk2jquqhpznzm", label:"Pack Wolf #106",  tag:"moto_holder" },
  { address:"bc1pesst323mlkfr6suysnq2nf89fpu37flh8dcq3lqe7mwyp040xnyquf3q7c", label:"Pack Wolf #107",  tag:"moto_holder" },
  { address:"bc1qavpley8uq4kmykt2kj5upgfwpckc0wgsww5fu0",                      label:"Pack Wolf #108",  tag:"moto_holder" },
  { address:"bc1pd2kp5nllm827gqxruvf60fjlpg8amdhf6e0uc0sehjm6ea2f70gs2kagqq", label:"Pack Wolf #109",  tag:"moto_holder" },
  { address:"bc1p8f5ygjgjemcnkshkx83ta5zy4l9g4y05lhw6d30d7gzjz06pc7eqxn4ue6", label:"Pack Wolf #110",  tag:"moto_holder" },
  { address:"bc1pctrmw22fmkz5pgsmeqy3ypeh89nv9g3qjhlt37xxfq4gfaphtcrqkzjmhr", label:"Pack Wolf #111",  tag:"moto_holder" },
  { address:"bc1qf87qznj0hnp9w8vuct0z4tmrcvm93vp7flx27q",                      label:"Pack Wolf #112",  tag:"moto_holder" },
  { address:"bc1pdhzsvwgcgt0q5w04xu7dx4r0uyywr943dlf355n7zzkfmgh0fm0s2d4fns", label:"Pack Wolf #113",  tag:"moto_holder" },
  { address:"bc1pa4s4kc02vvxvvzdqavtqrf704x00rv7hyslp7ml4utx2xx4cdp9s5ds4k7", label:"Pack Wolf #114",  tag:"moto_holder" },
  { address:"bc1qvqeur3gjsqac45nxcejgf8l3333qn3vm9d362x",                      label:"Pack Wolf #115",  tag:"moto_holder" },
  { address:"bc1pmeh4r3q0yfxkxuu0vjfg4w0j9968t9fdk9ghzfrnwdpalt6uvv5qvmjzw5", label:"Pack Wolf #116",  tag:"moto_holder" },
  { address:"bc1p36wwf87d0m0wqr937dg9f5xph56nw9llxrn3nc8fec0lruma8pyqnya8a5", label:"Pack Wolf #117",  tag:"moto_holder" },
  { address:"bc1pu3284e45n7apyddz49q4q8wf8s8pq4gmeanmu9wvsj7pejzm545qdny0ft",  label:"OPNet Protocol",  tag:"protocol" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const short  = a => !a?"???":`${a.slice(0,7)}…${a.slice(-5)}`;
const fmtBTC = s => { const n=parseInt(s,10)||0; return n>=1e8?`${(n/1e8).toFixed(3)}₿`:n>=1e5?`${(n/1e8).toFixed(5)}₿`:`${n.toLocaleString()} sats`; };
const tAgo   = t => { const s=Math.floor((Date.now()-new Date(t))/1000); return s<60?`${s}s`:s<3600?`${Math.floor(s/60)}m`:`${Math.floor(s/3600)}h`; };

function classifyTx(tx) {
  if ((tx.outputs||[]).some(o=>o.address===CONTRACTS.BURN)) return "BURN";
  if (tx.bytecode) return "DEPLOY";
  // Detect liquidity/pool operations on NativeSwap or Router
  const method = tx.method || tx.callData?.method || tx.input?.method || "";
  const mLower = (typeof method === "string" ? method : "").toLowerCase();
  if (tx.contractAddress===CONTRACTS.SWAP || tx.contractAddress===CONTRACTS.NATIVE_SWAP) {
    if (mLower.includes("createpool")) return "NEW_POOL";
    if (mLower.includes("listliquidity") || mLower.includes("addliquidity")) return "LIQ_ADD";
    if (mLower.includes("reserve") || mLower.includes("swap")) return "SWAP";
    return "SWAP"; // default for NativeSwap interactions
  }
  if (tx.contractAddress===CONTRACTS.STAKING) return "STAKE";
  if (tx.contractAddress===CONTRACTS.MOTO) return "TRANSFER";
  // Detect any contract call that looks like pool/liquidity operations
  if (tx.contractAddress) {
    if (mLower.includes("createpool") || mLower.includes("deploymotochef")) return "NEW_POOL";
    if (mLower.includes("addliquidity") || mLower.includes("listliquidity")) return "LIQ_ADD";
    return "CONTRACT";
  }
  return "MOVE";
}

async function rpc(method,params={}) {
  const tag = `[OPNet RPC] ${method}`;
  try {
    const body = {jsonrpc:"2.0",id:Date.now(),method,params:[params]};
    log(`${tag} →`, JSON.stringify(params));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.RPC_TIMEOUT); // M-04: 15s timeout
    const r = await fetch(RPC,{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body), signal:controller.signal});
    clearTimeout(timeout);
    if (!r.ok) { err(`${tag} HTTP ${r.status} ${r.statusText}`); return null; }
    const json = await r.json();
    // H-06 FIX: Validate response shape
    if (!json || typeof json !== "object") { err(`${tag} invalid response shape`); return null; }
    if (json.error) { err(`${tag} RPC error:`, json.error); return null; }
    if (!("result" in json)) { err(`${tag} missing result field`); return null; }
    log(`${tag} ✓`, typeof json.result === "string" ? json.result.slice(0,20) : "(object)");
    return json.result;
  } catch (e) {
    if (e.name === "AbortError") { err(`${tag} TIMEOUT (15s)`); return null; }
    err(`${tag} FAILED:`, e.message || e); return null;
  }
}

// ─── ORACLE ENGINE ───────────────────────────────────────────────────────────
// Priority: Claude API + Bob MCP (ai.opnet.org) → Claude API solo → local fallback
// H-07 FIX: Safe JSON extraction from AI responses
function safeParseOracleJSON(text) {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  // Try direct parse first
  try { const r = JSON.parse(cleaned); if (r && typeof r === "object") return r; } catch {}
  // Try to find the outermost balanced { }
  let start = -1, depth = 0, end = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === "{") { if (start === -1) start = i; depth++; }
    else if (cleaned[i] === "}") { depth--; if (depth === 0 && start !== -1) { end = i; break; } }
  }
  if (start !== -1 && end !== -1) {
    try { const r = JSON.parse(cleaned.slice(start, end + 1)); if (r && typeof r === "object") return r; } catch {}
  }
  return null;
}

const BOB_MCP = "https://ai.opnet.org/mcp";

async function callClaude(system, user) {
  // Try Claude API with Bob MCP server for OPNet-enriched analysis
  try {
    log("[Oracle] Calling Claude API + Bob MCP...");
    const r = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
      headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens:1500,
        system,
        messages:[{role:"user",content:user}],
        mcp_servers:[{type:"url",url:BOB_MCP,name:"opnet-bob"}],
      })});
    if (r.ok) {
      const d = await r.json();
      if (!d.error) {
        // Extract text from response (may have mixed content blocks from MCP tool use)
        const texts = (d.content||[]).filter(c=>c.type==="text").map(c=>c.text);
        const fullText = texts.join("\n") || "{}";
        log("[Oracle] ✓ Claude + Bob MCP response received");
        try {
          const parsed = safeParseOracleJSON(fullText); if (parsed) return parsed;
        } catch {
          // If JSON parse fails, try to extract JSON from the text


          warn("[Oracle] Could not parse response as JSON, falling back");
        }
      }
    }
    // If MCP call failed, try without MCP
    warn("[Oracle] MCP call failed, trying without Bob...");
  } catch (e) {
    warn("[Oracle] Claude+MCP error:", e.message);
  }

  // Fallback: Claude API without MCP
  try {
    log("[Oracle] Calling Claude API (no MCP)...");
    const r = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
      headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens:1000,
        system,
        messages:[{role:"user",content:user}],
      })});
    if (!r.ok) {
      const errText = await r.text().catch(()=>"");
      err(`[Oracle] HTTP ${r.status}: ${errText.slice(0,CONFIG.SNIPER_MAX)}`);
      if (r.status === 401 || r.status === 403) {
        warn("[Oracle] Auth failed — using local analysis fallback");
        return localOracle(user);
      }
      return localOracle(user);
    }
    const d = await r.json();
    if (d.error) { err("[Oracle] API error:", d.error); return localOracle(user); }
    const t = d.content?.find(c=>c.type==="text")?.text||"{}";
    log("[Oracle] ✓ Claude response received (no MCP)");
    const parsed = safeParseOracleJSON(t); if (parsed) return parsed; return localOracle(user);
  } catch (e) {
    err("[Oracle] FAILED:", e.message || e);
    return localOracle(user);
  }
}

// Local fallback oracle — deterministic analysis when Claude API is unavailable
function localOracle(prompt) {
  log("[Oracle] Running local analysis...");
  const p = prompt.toLowerCase();

  // Detect if this is a wallet analysis or pattern analysis
  const isPattern = p.includes("pattern:");
  if (isPattern) {
    const isHunt = p.includes("hunt") || p.includes("swap") || p.includes("buy");
    const isBurn = p.includes("burn") || p.includes("offering");
    const isFarm = p.includes("farm") || p.includes("stake") || p.includes("den shift");
    const isDeploy = p.includes("deploy") || p.includes("territory") || p.includes("contract");
    return {
      interpretation: isBurn ? "Multiple wolves burning MOTO signals conviction — likely a coordinated OrangePill commitment wave."
        : isHunt ? "Coordinated swap activity detected across the pack — classic accumulation pattern before a move."
        : isFarm ? "Pack migrating staking positions — watch for new pool deployments or APR shifts."
        : isDeploy ? "New contract deployment from a tracked wolf — early access opportunity if legit."
        : "Wolf pack activity detected — monitor for follow-up moves in the next few blocks.",
      riskLevel: isBurn ? "LOW" : isHunt ? "MEDIUM" : isDeploy ? "HIGH" : "MEDIUM",
      actionableSignal: isBurn ? "Bullish conviction signal — wolves destroying supply"
        : isHunt ? "Potential alpha — wolves accumulating same asset"
        : isFarm ? "Yield rotation — old farm may be drying up"
        : isDeploy ? "New territory — DYOR before aping"
        : "Watch and wait for confirmation",
      whatToDo: isBurn ? "Track burn amounts — large burns signal long-term conviction. Consider accumulating."
        : isHunt ? "Identify the target token/pool. If 3+ wolves are buying, there may be alpha."
        : isFarm ? "Check the new staking pool APR. If wolves are migrating, the new farm likely has better yield."
        : isDeploy ? "Review the contract. Check if the deployer is a known wolf. Wait for at least 2 more wolves to interact before entering."
        : "Continue monitoring. Set alerts for follow-up activity from these wallets.",
      confidence: isBurn ? 78 : isHunt ? 65 : isFarm ? 70 : isDeploy ? 55 : 50,
      relatedProjects: ["MOTO","OPNet Staking","MotoSwap"],
      timeframe: isBurn ? "Long-term bullish" : isHunt ? "Next 1-6 hours" : isFarm ? "Next 24 hours" : "Unknown",
      nextMoves: [
        "Monitor these wallets for follow-up txs",
        "Check if other wolves copy this pattern",
        "Track the target contract/pool for volume changes"
      ],
    };
  }

  // Wallet analysis fallback
  const isBurner = p.includes("burner");
  const isHolder = p.includes("holder") || p.includes("pack wolf");
  const isProtocol = p.includes("protocol");
  const isWhale = p.includes("whale");
  const isShark = p.includes("shark");
  const alertCount = parseInt((p.match(/alerts:\s*(\d+)/)||[])[1] || "0", 10);
  const hasTxs = p.includes('"txid"');

  return {
    smartMoneyScore: isBurner ? 85 : isWhale ? 90 : isShark ? 75 : isHolder ? 60 : 50,
    riskScore: isBurner ? 15 : isProtocol ? 5 : alertCount > 5 ? 60 : alertCount > 2 ? 40 : 20,
    alertLevel: alertCount > 5 ? "HIGH" : alertCount > 2 ? "MEDIUM" : "LOW",
    category: isBurner ? "OG Pill Wolf" : isProtocol ? "Team Wallet" : isWhale ? "Alpha Wolf" : isShark ? "Pack Hunter" : "OG Wolf",
    signals: [
      isBurner ? "🍊 OG pill wolf — earned airdrop via OrangePill burn" : "🐺 OG wolf — MOTO airdrop recipient",
      hasTxs ? "⚡ Recent on-chain activity detected" : "💤 No recent transactions observed",
      alertCount > 3 ? "🚨 High alert frequency — actively trading" : "🐺 Normal wolf behavior",
    ].filter(Boolean),
    connectionAnalysis: hasTxs
      ? "This wolf has been active on-chain. Cross-reference with other pack members to identify coordinated moves."
      : "Limited recent activity. This wolf may be dormant or accumulating off-chain.",
    tierInsight: isWhale ? "Top-tier wolf — moves from this wallet often signal major shifts."
      : isShark ? "Significant position. Watch for accumulation or distribution patterns."
      : "OG wolf. Track for copy-trade signals when larger wolves move.",
    burnBehavior: isBurner ? "Earned MOTO airdrop via OrangePill burn. One of the original committed wolves." : null,
    prediction: isBurner ? "OG pill wolf — likely to accumulate MOTO post-airdrop. Watch for staking moves."
      : alertCount > 3 ? "High activity suggests this wolf is positioning. Monitor targets."
      : "Holding steady. Will likely move when the pack moves.",
    summary: `${isBurner ? "OG pill wolf" : isProtocol ? "Team wallet" : "OG wolf"} with ${alertCount} recent alerts. ${hasTxs ? "Active on-chain — worth monitoring closely." : "Quiet period — may be accumulating or waiting for signals."}`,
    watchTags: isBurner ? ["og-wolf","pill","airdrop"] : isHolder ? ["og-wolf","holder","airdrop"] : ["tracked"],
    _localFallback: true,
  };
}

function detectPatterns(alerts, wallets) {
  const now = Date.now();
  const W = CONFIG.PATTERN_WINDOW;
  const rec = alerts.filter(a=>now-new Date(a.time)<W);
  const found = [];

  const burnAlerts = rec.filter(a=>a.type==="BURN");
  if(burnAlerts.length>=2){
    const uw=[...new Set(burnAlerts.map(a=>a.address))];
    if(uw.length>=2) found.push({...PATTERNS.BURN_WAVE,id:`bw${Date.now()}`,detail:`${uw.length} wolves burned MOTO for OrangePill`,wallets:uw,time:new Date().toISOString(),severity:"HIGH"});
  }

  const swaps = rec.filter(a=>a.type==="SWAP");
  if(swaps.length>=3){
    const uw=[...new Set(swaps.map(a=>a.address))];
    if(uw.length>=3) found.push({...PATTERNS.MASS_BUY,id:`mb${Date.now()}`,detail:`${uw.length} wolves swapped simultaneously — pack hunt signal`,wallets:uw,time:new Date().toISOString(),severity:"CRITICAL"});
  }

  const stakes = rec.filter(a=>a.type==="STAKE");
  if(stakes.length>=3){
    const uw=[...new Set(stakes.map(a=>a.address))];
    if(uw.length>=2) found.push({...PATTERNS.FARM_MOVE,id:`fm${Date.now()}`,detail:`${uw.length} wolves staking at same time`,wallets:uw,time:new Date().toISOString(),severity:"MEDIUM"});
  }

  const deploys = rec.filter(a=>a.type==="DEPLOY");
  for(const d of deploys){
    const w=wallets.find(x=>x.address===d.address);
    found.push({...PATTERNS.DEPLOY_WATCH,id:`dw${d.txid}`,detail:`${w?.label||short(d.address)} marked new territory — watch for pack followup`,wallets:[d.address],time:d.time,severity:"HIGH"});
  }

  const byW={};
  for(const a of rec){if(!byW[a.address])byW[a.address]=[];byW[a.address].push(a);}
  for(const [addr,acts] of Object.entries(byW)){
    if(acts.length>=4){const w=wallets.find(x=>x.address===addr);found.push({...PATTERNS.ACCUMULATE,id:`acc${addr}${Date.now()}`,detail:`${w?.label||short(addr)} — ${acts.length} moves in 10 min (accumulating)`,wallets:[addr],time:new Date().toISOString(),severity:"MEDIUM"});}
  }

  // ── SNIPER: New pool creation ──
  const newPools = rec.filter(a=>a.type==="NEW_POOL");
  for(const np of newPools){
    const w=wallets.find(x=>x.address===np.address);
    found.push({...PATTERNS.NEW_POOL,id:`np${np.txid}`,detail:`🚨 NEW POOL created by ${w?.label||short(np.address)} — first-mover window OPEN`,wallets:[np.address],time:np.time,severity:"CRITICAL",contractAddress:np.contractAddress||np.txid,isSniper:true});
  }

  // ── SNIPER: Liquidity injection ──
  const liqAdds = rec.filter(a=>a.type==="LIQ_ADD");
  for(const la of liqAdds){
    const w=wallets.find(x=>x.address===la.address);
    found.push({...PATTERNS.LIQ_ADD,id:`la${la.txid}`,detail:`💧 Liquidity added by ${w?.label||short(la.address)} — ${fmtBTC(la.value)} — early entry opportunity`,wallets:[la.address],time:la.time,severity:"HIGH",contractAddress:la.contractAddress||la.txid,value:la.value,isSniper:true});
  }

  // ── SNIPER: Wolf + new pool = early LP signal ──
  if(newPools.length>0 && liqAdds.length>0){
    const poolCreators=new Set(newPools.map(a=>a.address));
    const lpProviders=liqAdds.filter(a=>!poolCreators.has(a.address));
    if(lpProviders.length>0){
      const uw=[...new Set(lpProviders.map(a=>a.address))];
      found.push({...PATTERNS.EARLY_LP,id:`elp${Date.now()}`,detail:`🎯 ${uw.length} wolf(s) adding LP to freshly created pool — high-conviction early signal`,wallets:uw,time:new Date().toISOString(),severity:"CRITICAL",isSniper:true});
    }
  }

  return found;
}

// ─── OP WALLET PAYMENT FLOW ───────────────────────────────────────────────────
// Supports OP Wallet (window.opnet) and UniSat (window.unisat) as fallback
// Payment = permanent access for this wallet (stored in localStorage)

function getWalletProvider() {
  // Priority: OP Wallet > UniSat
  if (typeof window !== "undefined") {
    if (window.opnet) return { type: "opnet", api: window.opnet };
    if (window.unisat) return { type: "unisat", api: window.unisat };
  }
  return null;
}

async function connectOPWallet() {
  const wallet = getWalletProvider();
  if (!wallet) throw new Error("NO_WALLET");
  log(`[Wallet] Connecting via ${wallet.type}...`);
  try {
    let accounts;
    if (wallet.type === "opnet") {
      accounts = await wallet.api.requestAccounts();
    } else {
      // UniSat
      accounts = await wallet.api.requestAccounts();
    }
    if (!accounts || accounts.length === 0) throw new Error("NO_ACCOUNTS");
    // M-06 FIX: Normalize address — bech32 is lowercase
    const address = (accounts[0] || "").toLowerCase();
    log(`[Wallet] Connected: ${address.slice(0,10)}… via ${wallet.type}`);
    return { address, walletType: wallet.type };
  } catch(e) {
    err(`[Wallet] Connection failed:`, e.message || e);
    if (e.message === "NO_ACCOUNTS") throw e;
    throw new Error("CONNECT_FAILED");
  }
}

// Check if wallet already has permanent access
function hasPermanentAccess(addr) {
  if (!addr) return false;
  if (isWhitelisted(addr)) return true;
  try { return localStorage.getItem(ACCESS_KEY(addr)) === "1"; } catch { return false; }
}

// Grant permanent access
function grantAccess(addr) {
  try { localStorage.setItem(ACCESS_KEY(addr), "1"); } catch {}
}

// BTC payment via wallet sendBitcoin
async function payWithBTC() {
  const wallet = getWalletProvider();
  if (!wallet) throw new Error("NO_WALLET");
  try {
    log(`[Payment] Sending ${safeToNumber(ACCESS_FEE_BTC_SATS)} sats via ${wallet.type}...`);
    const recipient = _getRecipient();
    let txid;
    if (wallet.type === "opnet") {
      // OP Wallet sendBitcoin(toAddress, satoshis)
      txid = await wallet.api.sendBitcoin(recipient, safeToNumber(ACCESS_FEE_BTC_SATS));
    } else {
      // UniSat sendBitcoin(toAddress, satoshis)
      txid = await wallet.api.sendBitcoin(recipient, safeToNumber(ACCESS_FEE_BTC_SATS));
    }
    if (!txid) throw new Error("TX_REJECTED");
    log(`[Payment] BTC tx broadcast: ${txid}`);
    return { txid };
  } catch(e) {
    err(`[Payment] BTC payment failed:`, e.message || e);
    if (e.message === "TX_REJECTED") throw e;
    // User likely rejected in wallet popup
    if (e.message?.includes("reject") || e.message?.includes("cancel") || e.message?.includes("denied") || e.code === 4001) {
      throw new Error("TX_REJECTED");
    }
    throw new Error("BTC_PAYMENT_FAILED");
  }
}

// MOTO payment via OPNet token transfer (OP_20 transfer call)
async function payWithMOTO(fromAddress) {
  const wallet = getWalletProvider();
  if (!wallet) throw new Error("NO_WALLET");
  if (wallet.type !== "opnet") throw new Error("MOTO_REQUIRES_OPWALLET");
  const recipient = _getRecipient();
  log(`[Payment] Sending ${ACCESS_FEE_MOTO_DISPLAY} MOTO via OP Wallet...`);

  // Try multiple OP Wallet API methods (API may vary by version)
  const methods = [
    // Method 1: signAndBroadcastInteraction (newer API)
    async () => {
      if (!wallet.api.signAndBroadcastInteraction) return null;
      return await wallet.api.signAndBroadcastInteraction({
        contractAddress: CONTRACTS.MOTO,
        method: "transfer",
        params: [recipient, ACCESS_FEE_MOTO.toString()],
        from: fromAddress,
      });
    },
    // Method 2: sendTransaction with data (alternative API)
    async () => {
      if (!wallet.api.sendTransaction) return null;
      return await wallet.api.sendTransaction({
        to: CONTRACTS.MOTO,
        data: { method: "transfer", args: [recipient, ACCESS_FEE_MOTO.toString()] },
        from: fromAddress,
      });
    },
    // Method 3: callContract (older API)
    async () => {
      if (!wallet.api.callContract) return null;
      return await wallet.api.callContract({
        contractAddress: CONTRACTS.MOTO,
        functionName: "transfer",
        args: [recipient, ACCESS_FEE_MOTO.toString()],
      });
    },
  ];

  for (const method of methods) {
    try {
      const txid = await method();
      if (txid) {
        log(`[Payment] MOTO tx broadcast: ${txid}`);
        return { txid };
      }
    } catch(e) {
      if (e.message?.includes("reject") || e.message?.includes("cancel") || e.message?.includes("denied") || e.code === 4001) {
        throw new Error("TX_REJECTED");
      }
      warn(`[Payment] MOTO method failed, trying next:`, e.message);
    }
  }
  throw new Error("MOTO_TRANSFER_FAILED");
}

// Verify BTC payment on-chain via mempool.space
async function verifyBTCPayment(txid) {
  try {
    log(`[Payment] Verifying tx on mempool.space: ${txid}`);
    const r = await fetch(`https://mempool.space/api/tx/${txid}`);
    if (!r.ok) { warn(`[Payment] mempool.space returned ${r.status} for tx ${txid}`); return false; }
    const tx = await r.json();
    const recipientAddr = _getRecipient();
    const outputToRecipient = (tx.vout||[]).find(o =>
      o.scriptpubkey_address === recipientAddr &&
      o.value >= safeToNumber(ACCESS_FEE_BTC_SATS)
    );
    if (outputToRecipient) { log("[Payment] ✓ Payment verified on-chain"); return true; }
    warn("[Payment] Output to recipient not found yet — may still be propagating");
    return false;
  } catch (e) {
    // M-02 FIX: Network failure does NOT grant access — user must retry
    err("[Payment] mempool verification failed:", e.message || e);
    return false;
  }
}

// ─── BLOCK-BY-BLOCK SCANNER ──────────────────────────────────────────────────
// Scans OPNet mainnet blocks sequentially for wolf activity
async function scanBlock(blockNumber) {
  try {
    const hexBlock = "0x" + blockNumber.toString(16);
    const block = await rpc("getBlockByNumber", { blockNumber: hexBlock, includeTransactions: true });
    if (!block) {
      warn(`[BlockScan] Block #${blockNumber} returned null`);
      return { blockNumber, transactions: [], found: false };
    }
    const txs = block.transactions || [];
    return { blockNumber, transactions: txs, found: txs.length > 0, timestamp: block.timestamp };
  } catch (e) {
    err(`[BlockScan] Block #${blockNumber} error:`, e.message || e);
    return { blockNumber, transactions: [], found: false, error: true };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function LonelyWolf() {
  // ── Theme ─────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    try { const t = localStorage.getItem("lw_theme"); return t === "light" ? "light" : "dark"; } catch { return "dark"; }
  });
  const isLight = theme === "light";
  const toggleTheme = () => {
    const next = isLight ? "dark" : "light";
    setTheme(next);
    try { localStorage.setItem("lw_theme", next); } catch {}
  };

  // ── Access gate state ─────────────────────────────────────────────────────
  const [screen, setScreen]         = useState("gate"); // gate | paying | app
  const [connectedAddr, setConnAddr]= useState(null);
  const [payStatus, setPayStatus]   = useState("idle"); // idle|connecting|paying|verifying|done|error
  const [payError, setPayError]     = useState("");
  const [payTxid, setPayTxid]       = useState(null);
  const [payMethod, setPayMethod]   = useState("btc"); // btc | moto

  // ── Block-by-block scanner state ──────────────────────────────────────
  const [blockScanActive, setBlockScanActive] = useState(false);
  const [blockScanFrom, setBlockScanFrom]     = useState("");
  const [blockScanTo, setBlockScanTo]         = useState("");
  const [blockScanCurrent, setBlockScanCurrent] = useState(null);
  const [blockScanResults, setBlockScanResults] = useState([]);
  const [blockScanStats, setBlockScanStats]     = useState({ scanned: 0, withTx: 0, wolfHits: 0 });
  const blockScanRef = useRef(false);

  // ── App state ─────────────────────────────────────────────────────────────
  const initWallets = () => RAW_WALLETS.map((w,i)=>({
    ...w,id:i,satBalance:null,recentTxs:[],alertCount:0,scanned:false,firstSeen:null,connections:[],isNew:false
  }));
  const [wallets, setWallets]           = useState(initWallets);
  const [alerts, setAlerts]             = useState([]);
  const [patterns, setPatterns]         = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [blockH, setBlockH]             = useState(940100);
  const [tab, setTab]                   = useState("dashboard");
  const [filterTag, setFilterTag]       = useState("all");
  const [filterTier, setFilterTier]     = useState("all");
  const [search, setSearch]             = useState("");
  const [selW, setSelW]                 = useState(null);
  const [aiRes, setAiRes]               = useState(null);
  const [aiLoad, setAiLoad]             = useState(false);
  const [scanning, setScanning]         = useState(false);
  const [scanPct, setScanPct]           = useState(0);
  const [autoMode, setAutoMode]         = useState(false);
  const [customAddr, setCustomAddr]     = useState("");
  const [newCount, setNewCount]         = useState(0);
  const [patAi, setPatAi]               = useState(null);
  const [patAiLoad, setPatAiLoad]       = useState(false);
  const [sniperAlerts, setSniperAlerts] = useState([]);

  const alertsRef = useRef([]);
  const patsRef   = useRef([]);
  const ixRef     = useRef([]);
  const wmRef     = useRef({});
  const autoRef   = useRef(null);
  // Wolf link tracker: detects potential secondary wallets
  // Maps unknown addresses to their wolf connections
  // { addr: { wolves: {wolfAddr: count}, totalHits: n, types: Set, firstSeen, lastSeen } }
  const wolfLinksRef = useRef({});
  const WOLF_LINK_THRESHOLD = 3; // M-03 FIX: raised from 2 to reduce false positives
  // Exclude known contract addresses from wolf-link detection
  const EXCLUDED_FROM_LINKING = new Set([CONTRACTS.MOTO, CONTRACTS.STAKING, CONTRACTS.SWAP, CONTRACTS.NATIVE_SWAP, CONTRACTS.BURN]);

  // ── Check existing permanent access on load ────────────────────────────────
  useEffect(()=>{
    try {
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.startsWith("lw_paid_")){
          const v=localStorage.getItem(k);
          if(v==="1"){setScreen("app");break;}
        }
      }
    } catch {}
  },[]);

  useEffect(()=>{
    const m={};wallets.forEach(w=>{m[w.address]=w.id;});wmRef.current=m;
  },[wallets]);

  useEffect(()=>{
    if(screen!=="app") return;
    fetchBlock();
    const t=setInterval(fetchBlock,CONFIG.BLOCK_POLL);return()=>clearInterval(t);
  },[screen]);

  useEffect(()=>{
    if(screen!=="app") return;
    if(autoMode){autoRef.current=setInterval(runAutoScan,SCAN_INTERVAL);}
    else clearInterval(autoRef.current);
    return()=>clearInterval(autoRef.current);
  },[autoMode,wallets,screen]);

  async function fetchBlock(){
    const r=await rpc("getBlockNumber",{});
    if(r) setBlockH(parseInt(r,16));
  }

  // ── Fetch BTC balance per wallet on load (batched) ────────────────────
  const balanceFetched = useRef(false);
  useEffect(()=>{
    if(screen!=="app" || balanceFetched.current) return;
    balanceFetched.current = true;
    (async()=>{
      const BATCH = CONFIG.BALANCE_BATCH;
      const DELAY = CONFIG.BALANCE_DELAY;
      log(`[Balances] Fetching balances for ${wallets.length} wallets...`);
      for(let i=0; i<wallets.length; i+=BATCH){
        const batch = wallets.slice(i, i+BATCH);
        const results = await Promise.allSettled(
          batch.map(async(w)=>{
            const bal = await rpc("getBalance",{address:w.address});
            return { address:w.address, balance:bal };
          })
        );
        setWallets(prev=>{
          const next=[...prev];
          for(const r of results){
            if(r.status!=="fulfilled"||r.value.balance==null) continue;
            const {address,balance}=r.value;
            const idx=next.findIndex(w=>w.address===address);
            if(idx>-1){
              const sats=typeof balance==="string"? parseInt(balance,16) : (parseInt(balance,10)||0);
              next[idx]={...next[idx], satBalance:sats, scanned:true};
            }
          }
          return next;
        });
        if(i+BATCH<wallets.length) await new Promise(r=>setTimeout(r,DELAY));
      }
      log(`[Balances] Done fetching all wallet balances`);
    })();
  },[screen]);

  // ── Wallet connect + payment flow (whitelist bypass for owner) ──────
  async function handleConnect() {
    setPayStatus("connecting"); setPayError(""); setPayTxid(null);
    try {
      const { address, walletType } = await connectOPWallet();
      setConnAddr(address);
      // Check whitelist or existing permanent access
      if (isWhitelisted(address) || hasPermanentAccess(address)) {
        grantAccess(address);
        setPayStatus("done");
        setTimeout(()=>setScreen("app"), 800);
        return;
      }
      // MOTO payment requires OP Wallet specifically
      if (payMethod === "moto" && walletType !== "opnet") {
        setPayError("MOTO payment requires OP Wallet. Switch to BTC payment or install OP Wallet.");
        setPayStatus("error");
        return;
      }
      // Everyone else pays — BTC or MOTO
      setPayStatus("paying");
      let txid;
      if (payMethod === "moto") {
        const res = await payWithMOTO(address);
        txid = res.txid;
      } else {
        const res = await payWithBTC();
        txid = res.txid;
      }
      setPayTxid(txid);
      setPayStatus("verifying");
      await new Promise(r=>setTimeout(r,3000));
      // For BTC, verify on mempool. For MOTO, grant optimistically (on-chain OPNet)
      let ok = true;
      if (payMethod === "btc") {
        ok = await verifyBTCPayment(txid);
      }
      if (ok) {
        grantAccess(address);
        setPayStatus("done");
        setTimeout(()=>setScreen("app"), 1200);
      } else {
        setPayError("Payment broadcast but unconfirmed. It may take a few minutes. Click 'I paid' below to proceed.");
        setPayStatus("error");
      }
    } catch(e) {
      err("[Payment] handleConnect error:", e.message || e);
      const msg = e.message==="NO_WALLET"
        ? "No Bitcoin wallet detected. Install OP Wallet (opnet.org) or UniSat to continue."
        : e.message==="NO_ACCOUNTS"
        ? "No accounts found in your wallet. Create or unlock an account first."
        : e.message==="CONNECT_FAILED"
        ? "Wallet connection failed. Make sure your wallet is unlocked and try again."
        : e.message==="TX_REJECTED"
        ? "Payment cancelled by user."
        : e.message==="BTC_PAYMENT_FAILED"
        ? "BTC payment failed. Check your wallet balance and try again."
        : e.message==="MOTO_REQUIRES_OPWALLET"
        ? "MOTO payment requires OP Wallet. Install it at opnet.org or use BTC payment instead."
        : e.message==="MOTO_TRANSFER_FAILED"
        ? "MOTO transfer failed. Your OP Wallet may not support this method yet — try BTC payment instead."
        : `Connection error: ${e.message || "Unknown error"}`;
      setPayError(msg); setPayStatus("error");
    }
  }

  // C-02 FIX: No bypass — payment must be verified on-chain

  // ── Core scan logic ───────────────────────────────────────────────────────

  // SNIPER: scans ALL txs for pool/liquidity/deploy events — not just wolf txs
  function processSniperBatch(txs) {
    const known = wmRef.current;
    const newSniper = [];
    for (const tx of txs) {
      const type = classifyTx(tx);
      // Only care about sniper-relevant tx types
      if (type !== "NEW_POOL" && type !== "LIQ_ADD" && type !== "DEPLOY") continue;
      const id = `snp-${tx.id || tx.txid || Date.now()}-${type}`;
      // Skip duplicates
      if (sniperAlerts.some(s => s.id === id)) continue;
      const addrs = (tx.outputs||[]).map(o=>o.address).filter(Boolean);
      if (tx.from) addrs.push(tx.from);
      const creator = tx.from || addrs[0] || "unknown";
      const isKnownWolf = known[creator] !== undefined;
      const wolfData = isKnownWolf ? wallets.find(w=>w.address===creator) : null;
      const contractAddr = tx.contractAddress || tx.to || tx.id || "";
      const val = (tx.outputs||[]).reduce((s,o)=>s+parseInt(o.value||"0",10),0);
      const time = tx.firstSeen || tx.timestamp || new Date().toISOString();

      let label, color, detail, severity;
      if (type === "NEW_POOL") {
        label = "💎 New Pool Created";
        color = "#22d3ee";
        severity = "CRITICAL";
        detail = isKnownWolf
          ? `🐺 Known wolf ${wolfData?.label||short(creator)} created a new pool — high conviction`
          : `👤 Unknown address ${short(creator)} created a new pool — scout & verify`;
      } else if (type === "LIQ_ADD") {
        label = "💧 Liquidity Injected";
        color = "#06b6d4";
        severity = isKnownWolf ? "HIGH" : "MEDIUM";
        detail = isKnownWolf
          ? `🐺 ${wolfData?.label||short(creator)} added liquidity — ${fmtBTC(val)} — wolf-backed LP`
          : `👤 ${short(creator)} added liquidity — ${fmtBTC(val)} — new player entering`;
      } else {
        label = "🚀 New Contract Deployed";
        color = "#b794f4";
        severity = isKnownWolf ? "HIGH" : "MEDIUM";
        detail = isKnownWolf
          ? `🐺 ${wolfData?.label||short(creator)} deployed new contract — watch for launch`
          : `👤 ${short(creator)} deployed new contract — potential new project`;
      }

      newSniper.push({
        id, label, color, severity, detail, time,
        contractAddress: contractAddr,
        value: val,
        creator,
        isKnownWolf,
        wolfLabel: wolfData?.label || null,
        wolfTag: wolfData?.tag || null,
        txid: tx.id || tx.txid || "",
        type,
        isSniper: true,
        // Track all involved addresses for analysis
        participants: addrs.slice(0, 10),
      });
    }
    if (newSniper.length > 0) {
      setSniperAlerts(prev => [...newSniper, ...prev].slice(0, 200));
      log(`[Sniper] 🎯 ${newSniper.length} new signal(s) — ${newSniper.filter(s=>s.isKnownWolf).length} from wolves, ${newSniper.filter(s=>!s.isKnownWolf).length} from unknown`);
    }
  }

  function processBatch(txs) {
    // SNIPER: scan ALL txs for pool/liq/deploy events (wolf or not)
    processSniperBatch(txs);

    const known=wmRef.current;
    const newWs=[],newAl=[],newIx=[];
    const linkedToAdd = []; // wallets flagged as linked

    for(const tx of txs){
      const addrs=(tx.outputs||[]).map(o=>o.address).filter(Boolean);
      if(tx.from) addrs.push(tx.from);
      const inv=addrs.filter(a=>known[a]!==undefined);
      const unk=addrs.filter(a=>known[a]===undefined&&a&&(a.startsWith("bc1")||a.startsWith("1")));
      const type=classifyTx(tx);
      const val=(tx.outputs||[]).reduce((s,o)=>s+parseInt(o.value||"0",10),0);
      const time=tx.firstSeen||new Date().toISOString();

      if(inv.length>=2){
        for(let i=0;i<inv.length-1;i++){for(let j=i+1;j<inv.length;j++){
          const ix={id:`${tx.id}-${i}-${j}`,from:inv[i],to:inv[j],txid:tx.id,value:val,type,time};
          if(!ixRef.current.find(x=>x.id===ix.id)) newIx.push(ix);
        }}
      }
      for(const addr of inv){
        const al={id:`${tx.id}-${addr}`,address:addr,txid:tx.id,type,value:val,time,wid:known[addr]};
        newAl.push(al);
      }

      // ── WOLF LINK DETECTION ──────────────────────────────────────────
      // Track unknown addresses that interact with known wolves
      // M-08 FIX: Prune old entries every 100 txs to prevent memory leak
      if(Object.keys(wolfLinksRef.current).length > CONFIG.WOLF_LINK_PRUNE){
        const cutoff = new Date(Date.now() - CONFIG.WOLF_LINK_MAX_AGE).toISOString(); // 1 hour ago
        for(const [addr, link] of Object.entries(wolfLinksRef.current)){
          if(link.lastSeen < cutoff && link.totalHits < WOLF_LINK_THRESHOLD){
            delete wolfLinksRef.current[addr];
          }
        }
      }
      if(inv.length>0 && unk.length>0){
        for(const uAddr of unk){
          // M-03 FIX: skip known contract addresses
          if(EXCLUDED_FROM_LINKING.has(uAddr)) continue;
          if(!wolfLinksRef.current[uAddr]){
            wolfLinksRef.current[uAddr]={wolves:{},totalHits:0,types:new Set(),firstSeen:time,lastSeen:time,txids:[]};
          }
          const link=wolfLinksRef.current[uAddr];
          link.lastSeen=time;
          link.totalHits++;
          link.types.add(type);
          link.txids.push(tx.id||tx.txid||"");
          for(const wAddr of inv){
            link.wolves[wAddr]=(link.wolves[wAddr]||0)+1;
          }

          // Check if this address should be auto-added
          // Signals: 2+ total interactions with wolves, OR direct fund transfer + DeFi activity
          const wolfCount=Object.keys(link.wolves).length;
          const hitCount=link.totalHits;
          const hasDeFi=link.types.has("SWAP")||link.types.has("STAKE")||link.types.has("LIQ_ADD")||link.types.has("NEW_POOL")||link.types.has("DEPLOY");
          const hasTransfer=link.types.has("TRANSFER")||link.types.has("MOVE");

          const shouldAdd =
            hitCount >= WOLF_LINK_THRESHOLD ||           // 2+ interactions with any wolves
            (wolfCount >= 2) ||                           // interacted with 2+ different wolves
            (hasTransfer && hasDeFi);                     // received funds then did DeFi = alt wallet

          if(shouldAdd && !newWs.find(w=>w.address===uAddr)){
            // Find the most-connected wolf for the label
            const topWolf=Object.entries(link.wolves).sort((a,b)=>b[1]-a[1])[0];
            const topWolfData=wallets.find(w=>w.address===topWolf?.[0]);
            const linkedLabel=topWolfData
              ? `🔗 ${topWolfData.label} alt`
              : `🔗 Linked ${short(uAddr)}`;

            linkedToAdd.push({
              address:uAddr,
              label:linkedLabel,
              tag:"linked",
              id:Date.now()+Math.random(),
              satBalance:null,
              recentTxs:[{txid:tx.id,type,value:val,time}],
              alertCount:1,
              scanned:false,
              firstSeen:link.firstSeen,
              connections:Object.keys(link.wolves),
              isNew:true,
              linkedTo:topWolf?.[0]||null,
              linkEvidence:{
                totalHits:hitCount,
                wolfConnections:wolfCount,
                activityTypes:[...link.types],
                txids:link.txids.slice(-5),
              },
            });
            log(`[Wolf Link] 🔗 Auto-adding ${short(uAddr)} — ${hitCount} hits with ${wolfCount} wolf(es), types: ${[...link.types].join(",")}`);
          }
        }
      }

      // Also add unknown addresses found alongside wolves (original scout logic)
      if(inv.length>0){
        for(const addr of unk){
          if(!newWs.find(w=>w.address===addr)&&!linkedToAdd.find(w=>w.address===addr)){
            newWs.push({address:addr,label:`Scout ${short(addr)}`,tag:"new",id:Date.now()+Math.random(),satBalance:null,recentTxs:[{txid:tx.id,type,value:val,time}],alertCount:1,scanned:false,firstSeen:time,connections:inv,isNew:true});
          }
        }
      }
    }

    // Merge linked wallets into newWs (they take priority over scouts)
    const allNew=[...linkedToAdd,...newWs];

    if(allNew.length>0){
      setWallets(p=>{
        const ex=new Set(p.map(w=>w.address));
        const add=allNew.filter(w=>!ex.has(w.address));
        if(!add.length)return p;
        setNewCount(c=>c+add.length);
        // Fire a pattern alert for each linked wallet
        const linkedPats=add.filter(w=>w.tag==="linked").map(w=>({
          ...PATTERNS.LINKED_WALLET,
          id:`link-${w.address}-${Date.now()}`,
          detail:`🔗 Auto-tracking ${w.label} — ${w.linkEvidence?.totalHits||0} interactions with ${w.linkEvidence?.wolfConnections||0} wolf(es). Activity: ${(w.linkEvidence?.activityTypes||[]).join(", ")}`,
          wallets:[w.address,...(w.connections||[])],
          time:new Date().toISOString(),
          severity:"HIGH",
          isSniper:false,
        }));
        if(linkedPats.length>0){
          patsRef.current=[...linkedPats,...patsRef.current].slice(0,CONFIG.PATTERNS_MAX);
          setPatterns([...patsRef.current]);
        }
        return[...p,...add];
      });
    }
    if(newIx.length>0){ixRef.current=[...newIx,...ixRef.current].slice(0,CONFIG.INTERACTIONS_MAX);setInteractions([...ixRef.current]);}
    if(newAl.length>0){
      const ex=new Set(alertsRef.current.map(a=>a.id));
      const fresh=newAl.filter(a=>!ex.has(a.id));
      if(fresh.length>0){
        alertsRef.current=[...fresh,...alertsRef.current].slice(0,CONFIG.ALERTS_MAX);setAlerts([...alertsRef.current]);
        setWallets(p=>{const c=[...p];for(const al of fresh){const idx=c.findIndex(w=>w.id===al.wid);if(idx>-1)c[idx]={...c[idx],alertCount:c[idx].alertCount+1,recentTxs:[{txid:al.txid,type:al.type,value:al.value,time:al.time},...c[idx].recentTxs].slice(0,20)};}return c;});
        const np=detectPatterns([...fresh,...alertsRef.current],wallets);
        if(np.length>0){
          const ex2=new Set(patsRef.current.map(p=>p.id));
          const fp=np.filter(p=>!ex2.has(p.id));
          if(fp.length>0){
            patsRef.current=[...fp,...patsRef.current].slice(0,CONFIG.PATTERNS_MAX);
            setPatterns([...patsRef.current]);
          }
        }
      }
    }
  }

  async function runAutoScan(){
    const r=await rpc("getLatestPendingTransactions",{limit:CONFIG.TX_LIMIT});
    processBatch(r?.transactions||[]);
  }

  async function runFullScan(){
    if(scanning)return;setScanning(true);setScanPct(0);
    const r=await rpc("getLatestPendingTransactions",{limit:CONFIG.TX_LIMIT});
    processBatch(r?.transactions||[]);
    for(let i=0;i<10;i++){setScanPct((i+1)*10);await new Promise(r=>setTimeout(r,100));}
    setScanning(false);
  }

  function addCustom(){
    const a=customAddr.trim();
    if(!a||!a.startsWith("bc1")||wallets.some(w=>w.address===a))return;
    setWallets(p=>[{id:Date.now(),address:a,label:`Custom ${short(a)}`,tag:"custom",satBalance:null,recentTxs:[],alertCount:0,scanned:false,firstSeen:new Date().toISOString(),connections:[],isNew:false},...p]);
    setCustomAddr("");
  }

  // ── Block-by-block mainnet scanner ────────────────────────────────────
  async function startBlockScan() {
    const from = parseInt(blockScanFrom,10) || (blockH - 50);
    const to = parseInt(blockScanTo,10) || blockH;
    if (from > to || blockScanActive) return;
    setBlockScanActive(true);
    blockScanRef.current = true;
    setBlockScanResults([]);
    setBlockScanStats({ scanned: 0, withTx: 0, wolfHits: 0 });
    const known = wmRef.current;

    for (let b = from; b <= to; b += BLOCK_SCAN_BATCH) {
      if (!blockScanRef.current) break;
      const batch = [];
      for (let i = 0; i < BLOCK_SCAN_BATCH && b + i <= to; i++) {
        batch.push(scanBlock(b + i));
      }
      const results = await Promise.all(batch);
      let batchWithTx = 0, batchWolfHits = 0;
      const batchResults = [];

      for (const res of results) {
        if (res.error) continue;
        const wolfTxs = [];
        for (const tx of res.transactions) {
          const addrs = (tx.outputs || []).map(o => o.address).filter(Boolean);
          if (tx.from) addrs.push(tx.from);
          const involvedWolves = addrs.filter(a => known[a] !== undefined);
          if (involvedWolves.length > 0) {
            wolfTxs.push({ ...tx, involvedWolves });
            batchWolfHits++;
          }
        }
        if (res.transactions.length > 0) batchWithTx++;
        if (wolfTxs.length > 0) {
          batchResults.push({ blockNumber: res.blockNumber, wolfTxs, totalTxs: res.transactions.length, timestamp: res.timestamp });
          // Feed wolf txs into main processBatch
          processBatch(wolfTxs);
        }
      }

      setBlockScanCurrent(Math.min(b + BLOCK_SCAN_BATCH - 1, to));
      setBlockScanStats(prev => ({
        scanned: prev.scanned + results.length,
        withTx: prev.withTx + batchWithTx,
        wolfHits: prev.wolfHits + batchWolfHits,
      }));
      if (batchResults.length > 0) {
        setBlockScanResults(prev => [...batchResults, ...prev].slice(0, 200));
      }
      // Small delay to not hammer RPC
      await new Promise(r => setTimeout(r, 300));
    }
    setBlockScanActive(false);
    blockScanRef.current = false;
  }

  function stopBlockScan() {
    blockScanRef.current = false;
    setBlockScanActive(false);
  }

  async function analyzeWallet(w){
    setSelW(w);setAiRes(null);setAiLoad(true);setTab("analysis");
    // Pre-fetch live balance from OPNet RPC for fresh data
    let liveBal = w.satBalance;
    try {
      const bal = await rpc("getBalance",{address:w.address});
      if (bal != null) {
        liveBal = typeof bal === "string" ? parseInt(bal,16) : (parseInt(bal,10)||0);
        // Update wallet state with fresh balance
        setWallets(prev => {
          const next = [...prev];
          const idx = next.findIndex(x=>x.address===w.address);
          if(idx>-1) next[idx] = {...next[idx], satBalance:liveBal, scanned:true};
          return next;
        });
      }
    } catch(e) { warn("[Oracle] Balance pre-fetch failed:", e.message); }
    const tier=getTier(liveBal);
    const myIx=interactions.filter(i=>i.from===w.address||i.to===w.address);
    const connW=myIx.map(i=>{const cw=wallets.find(x=>x.address===(i.from===w.address?i.to:i.from));return cw?`${cw.label}(${cw.tag})`:short(i.from===w.address?i.to:i.from);});
    const res=await callClaude(
      `You are an OPNet Bitcoin L1 DeFi analyst for the Lonely Wolf OG tracker. OPNet is a smart contract platform on Bitcoin mainnet (RPC: mainnet.opnet.org). MOTO is the governance token — all tracked wallets are future MOTO airdrop recipients (OG wolves) from the mainnet launch. Tags: moto_holder = OG wolf, moto_burner = earned airdrop via OrangePill burn, motocat = cat holder, protocol = team wallet. These are all whales/OGs worth tracking. Key contracts: MOTO token (${CONTRACTS.MOTO}), Staking (${CONTRACTS.STAKING}), MotoSwap Router (${CONTRACTS.SWAP}), OrangePill Burn address (${CONTRACTS.BURN}). If you have access to Bob (opnet-bob MCP), use opnet_rpc or opnet_contract_addresses to enrich your analysis. Respond ONLY valid JSON.`,
      `Wolf: ${w.address}\nLabel: ${w.label}\nPack tag: ${w.tag}\nTier: ${tier.label} (${fmtBTC(liveBal)})\nLive BTC balance: ${liveBal != null ? liveBal + " sats" : "unknown"}\nAlerts: ${w.alertCount}\nRecent txs: ${JSON.stringify(w.recentTxs.slice(0,5))}\nConnected to: ${connW.slice(0,6).join(", ")||"none"}\nTotal tracked wolves: ${wallets.length}\nCurrent block: ${blockH}\n\nReturn JSON:{smartMoneyScore,riskScore,alertLevel,category,signals:[],connectionAnalysis,tierInsight,burnBehavior,prediction,summary,watchTags:[]}`
    );
    setAiRes(res);setAiLoad(false);
  }

  async function analyzePattern(p){
    setPatAiLoad(true);setPatAi(null);setTab("patterns");
    const pw=p.wallets.map(a=>{const w=wallets.find(x=>x.address===a);return w?`${w.label}(${w.tag},${getTier(w.satBalance).label},${w.alertCount}alerts)`:short(a);});
    const res=await callClaude(
      `You are an OPNet Bitcoin L1 wolf pack analyst for the Lonely Wolf OG tracker. All tracked wallets are MOTO airdrop recipients — OG wolves, team wallets, and whales. OPNet is a smart contract platform on Bitcoin mainnet. MOTO is the governance token. Key contracts: MOTO (${CONTRACTS.MOTO}), Staking (${CONTRACTS.STAKING}), MotoSwap (${CONTRACTS.SWAP}), Burn vault (${CONTRACTS.BURN}). If you have access to Bob (opnet-bob MCP), use opnet_rpc to check latest block activity or opnet_contract_addresses for contract info. Respond ONLY valid JSON.`,
      `Pattern: ${p.label}\nDetail: ${p.detail}\nWolves: ${pw.join(", ")}\nTime: ${p.time}\nCurrent block: ${blockH}\nTotal tracked wolves: ${wallets.length}\n\nReturn JSON:{interpretation,riskLevel,actionableSignal,whatToDo,confidence,relatedProjects:[],timeframe,nextMoves:[]}`
    );
    setPatAi({...res,pattern:p});setPatAiLoad(false);
  }

  const disp=wallets.filter(w=>{
    if(filterTag!=="all"&&w.tag!==filterTag)return false;
    if(filterTier!=="all"&&getTier(w.satBalance).id!==filterTier)return false;
    if(search){const q=search.toLowerCase();if(!w.label.toLowerCase().includes(q)&&!w.address.includes(q))return false;}
    return true;
  });
  const tagC=Object.keys(TAGS).reduce((a,k)=>{a[k]=wallets.filter(w=>w.tag===k).length;return a;},{});
  const sevC={CRITICAL:"#fc8181",HIGH:"#f6ad55",MEDIUM:"#f6e05e",LOW:"#68d391"};
  const txC={BURN:"#fc8181",DEPLOY:"#b794f4",STAKE:"#f6ad55",SWAP:"#68d391",TRANSFER:"#63b3ed",CONTRACT:"#fc8181",MOVE:"#2d3748",NEW_POOL:"#22d3ee",LIQ_ADD:"#06b6d4"};

  // ══════════════════════════════════════════════════════════════════════════
  // WOLF STYLE
  // ══════════════════════════════════════════════════════════════════════════
  const wolfStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap');

    :root {
      --bg:       ${isLight ? "#f5f3f0" : "#08070a"};
      --bg2:      ${isLight ? "#eae7e3" : "#0d0b12"};
      --bg3:      ${isLight ? "#dfdbd6" : "#13101a"};
      --border:   ${isLight ? "rgba(100,60,180,.12)" : "rgba(139,92,246,.12)"};
      --border2:  ${isLight ? "rgba(100,60,180,.22)" : "rgba(139,92,246,.22)"};
      --moon:     ${isLight ? "#6d28d9" : "#c4b5fd"};
      --gold:     ${isLight ? "#b45309" : "#fbbf24"};
      --blood:    ${isLight ? "#dc2626" : "#f87171"};
      --howl:     ${isLight ? "#7c3aed" : "#a78bfa"};
      --fog:      ${isLight ? "#6b7280" : "#4b5563"};
      --text:     ${isLight ? "#1f1733" : "#e2d9f3"};
      --muted:    ${isLight ? "#9ca3af" : "#6b7280"};
    }

    * { box-sizing:border-box; margin:0; padding:0; }
    body, html { background:var(--bg); }

    ::-webkit-scrollbar { width:3px; }
    ::-webkit-scrollbar-thumb { background:rgba(139,92,246,.3); border-radius:2px; }

    @keyframes moonPulse { 0%,100%{opacity:.8;transform:scale(1)}50%{opacity:1;transform:scale(1.03)} }
    @keyframes howl { 0%,100%{text-shadow:0 0 20px rgba(167,139,250,.4)}50%{text-shadow:0 0 60px rgba(167,139,250,.9),0 0 100px rgba(167,139,250,.3)} }
    @keyframes fogDrift { 0%{transform:translateX(-30px)}100%{transform:translateX(30px)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none} }
    @keyframes scanLine { 0%{transform:translateY(-100%)}100%{transform:translateY(100vh)} }
    @keyframes claw { from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0% 0 0)} }
    @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.3} }
    @keyframes wolfEnter { from{opacity:0;transform:scale(.96) translateY(20px)}to{opacity:1;transform:none} }
    @keyframes stars { from{opacity:0}to{opacity:1} }

    .wolf-app {
      font-family:'Crimson Pro',serif;
      background:var(--bg);
      color:var(--text);
      min-height:100vh;
      position:relative;
      overflow-x:hidden;
    }

    /* Stars background */
    .wolf-stars {
      position:fixed;inset:0;pointer-events:none;z-index:0;
      ${isLight ? "display:none;" : `background: radial-gradient(ellipse at 20% 50%,rgba(139,92,246,.04) 0%,transparent 60%),
                  radial-gradient(ellipse at 80% 20%,rgba(167,139,250,.03) 0%,transparent 50%);`}
    }
    .wolf-stars::before {
      content:'';position:absolute;inset:0;
      background-image:
        radial-gradient(1px 1px at 10% 15%,rgba(196,181,253,.6) 0%,transparent 100%),
        radial-gradient(1px 1px at 25% 8%,rgba(196,181,253,.4) 0%,transparent 100%),
        radial-gradient(1px 1px at 40% 22%,rgba(196,181,253,.7) 0%,transparent 100%),
        radial-gradient(1px 1px at 55% 5%,rgba(196,181,253,.5) 0%,transparent 100%),
        radial-gradient(1px 1px at 70% 18%,rgba(196,181,253,.6) 0%,transparent 100%),
        radial-gradient(1px 1px at 85% 12%,rgba(196,181,253,.4) 0%,transparent 100%),
        radial-gradient(1px 1px at 92% 30%,rgba(196,181,253,.3) 0%,transparent 100%),
        radial-gradient(1.5px 1.5px at 5% 45%,rgba(196,181,253,.5) 0%,transparent 100%),
        radial-gradient(1px 1px at 35% 55%,rgba(196,181,253,.3) 0%,transparent 100%),
        radial-gradient(1px 1px at 65% 70%,rgba(196,181,253,.4) 0%,transparent 100%),
        radial-gradient(1.5px 1.5px at 78% 60%,rgba(196,181,253,.6) 0%,transparent 100%);
    }

    /* Scan line effect */
    .scan-line {
      position:fixed;top:0;left:0;right:0;height:1px;
      background:linear-gradient(90deg,transparent,rgba(139,92,246,.4),transparent);
      animation:scanLine 8s linear infinite;pointer-events:none;z-index:1;opacity:${isLight ? "0" : ".4"};
    }

    .wolf-wrap { position:relative;z-index:2;max-width:1520px;margin:0 auto;padding:0 18px 80px; }

    /* GATE SCREEN */
    .gate-screen {
      min-height:100vh;display:flex;align-items:center;justify-content:center;
      flex-direction:column;gap:0;position:relative;z-index:2;
      animation:wolfEnter .8s ease forwards;
    }

    .gate-moon {
      width:180px;height:180px;border-radius:50%;
      background:radial-gradient(circle at 35% 35%,#f5f3ff,#c4b5fd 40%,#7c3aed 80%,#4c1d95);
      box-shadow:0 0 80px rgba(139,92,246,.5),0 0 160px rgba(139,92,246,.2);
      animation:moonPulse 4s ease-in-out infinite;
      margin-bottom:32px;position:relative;
    }
    .gate-moon::after {
      content:'';position:absolute;inset:-4px;border-radius:50%;
      border:1px solid rgba(196,181,253,.3);
    }

    /* Wolf silhouette SVG-style via clip */
    .wolf-silhouette {
      position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);
      font-size:56px;filter:drop-shadow(0 0 15px rgba(139,92,246,.6));
    }

    .gate-title {
      font-family:'Cinzel',serif;font-size:clamp(28px,6vw,62px);
      font-weight:900;letter-spacing:8px;text-transform:uppercase;
      color:var(--moon);animation:howl 3s ease-in-out infinite;
      text-align:center;line-height:1;margin-bottom:8px;
    }
    .gate-sub {
      font-style:italic;color:var(--muted);letter-spacing:3px;font-size:14px;
      text-align:center;margin-bottom:48px;
    }

    .gate-card {
      background:rgba(13,11,18,.95);border:1px solid var(--border2);border-radius:16px;
      padding:36px 40px;max-width:460px;width:100%;text-align:center;
      backdrop-filter:blur(20px);box-shadow:0 0 60px rgba(139,92,246,.1);
    }
    .gate-price {
      font-family:'Cinzel',serif;font-size:52px;font-weight:900;color:var(--gold);
      text-shadow:0 0 30px rgba(251,191,36,.4);margin-bottom:6px;
    }
    .gate-price-sub { font-size:13px;color:var(--muted);margin-bottom:24px;letter-spacing:1px; }
    .gate-perks { text-align:left;margin-bottom:28px;display:flex;flex-direction:column;gap:8px; }
    .gate-perk { display:flex;gap:10px;font-size:14px;color:rgba(226,217,243,.7);line-height:1.5; }
    .gate-perk span:first-child { color:var(--moon);flex-shrink:0; }

    .pay-btn {
      width:100%;padding:15px 24px;border-radius:10px;cursor:pointer;
      font-family:'Cinzel',serif;font-size:14px;letter-spacing:3px;font-weight:700;
      background:linear-gradient(135deg,#7c3aed,#a855f7);
      border:1px solid rgba(167,139,250,.4);color:#fff;
      box-shadow:0 0 30px rgba(139,92,246,.35);transition:all .2s;
    }
    .pay-btn:hover { box-shadow:0 0 50px rgba(139,92,246,.6);transform:translateY(-1px); }
    .pay-btn:disabled { opacity:.5;cursor:not-allowed;transform:none; }

    .pay-status { margin-top:16px;font-size:12px;letter-spacing:1px; }
    .pay-error { margin-top:12px;padding:10px 14px;border-radius:6px;font-size:12px;
      background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);color:#fc8181;line-height:1.6; }

    .wallet-badge {
      display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;
      background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.2);
      font-size:10px;letter-spacing:1px;color:var(--howl);margin-bottom:20px;
    }

    /* MAIN HEADER */
    .wolf-hdr {
      display:flex;align-items:center;justify-content:space-between;
      padding:14px 0 12px;border-bottom:1px solid var(--border);margin-bottom:18px;
    }
    .wolf-logo {
      font-family:'Cinzel',serif;font-size:20px;font-weight:900;letter-spacing:4px;
      background:linear-gradient(135deg,var(--moon),var(--gold));
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;
      animation:howl 4s ease-in-out infinite;
    }

    /* TABS */
    .wolf-tabs { display:flex;gap:4px;margin-bottom:18px;flex-wrap:wrap; }
    .wolf-tab {
      padding:7px 15px;border-radius:5px;font-size:10px;letter-spacing:1.5px;
      cursor:pointer;font-family:'Cinzel',serif;font-size:9px;transition:all .15s;
      border:1px solid transparent;font-weight:700;background:transparent;
    }
    .wolf-tab.on { background:rgba(139,92,246,.1);border-color:rgba(139,92,246,.35);color:var(--moon); }
    .wolf-tab.off { border-color:rgba(255,255,255,.05);color:var(--fog); }

    /* CARD */
    .wolf-card {
      background:${isLight ? "rgba(255,255,255,.92)" : "rgba(13,11,18,.95)"};border:1px solid var(--border);border-radius:10px;
      padding:16px;backdrop-filter:blur(8px);${isLight ? "box-shadow:0 1px 4px rgba(0,0,0,.06);" : ""}
    }
    .wolf-sect { font-family:'Cinzel',serif;font-size:9px;letter-spacing:2px;color:var(--moon);margin-bottom:10px;font-weight:700; }

    /* PILLS */
    .wolf-pill {
      display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;
      font-size:10px;font-family:'Cinzel',serif;letter-spacing:.5px;font-weight:700;
    }

    /* INPUT */
    .wolf-inp {
      background:${isLight ? "rgba(0,0,0,.04)" : "rgba(0,0,0,.6)"};border:1px solid ${isLight ? "rgba(100,60,180,.18)" : "rgba(139,92,246,.2)"};border-radius:6px;
      padding:8px 12px;color:var(--text);font-size:11px;font-family:'Crimson Pro',serif;outline:none;
    }
    .wolf-inp::placeholder{color:${isLight ? "#a0a0a0" : "#2d3748"};}
    .wolf-inp:focus{border-color:rgba(139,92,246,.5);}

    /* BTN */
    .wolf-btn {
      padding:8px 18px;border-radius:6px;cursor:pointer;font-size:9px;letter-spacing:1.5px;
      font-family:'Cinzel',serif;transition:all .15s;font-weight:700;
      background:${isLight ? "rgba(109,40,217,.08)" : "rgba(139,92,246,.08)"};border:1px solid ${isLight ? "rgba(109,40,217,.25)" : "rgba(139,92,246,.25)"};color:var(--moon);
    }
    .wolf-btn:hover{background:${isLight ? "rgba(109,40,217,.15)" : "rgba(139,92,246,.15)"};}
    .wolf-btn.ghost{background:transparent;border-color:${isLight ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.06)"};color:var(--fog);}
    .wolf-btn.danger{background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.25);color:#dc2626;}

    /* ROW */
    .wolf-row {
      display:flex;align-items:center;gap:10px;padding:9px 12px;
      border-radius:7px;border:1px solid ${isLight ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.04)"};
      margin-bottom:5px;cursor:pointer;transition:all .12s;
    }
    .wolf-row:hover{background:${isLight ? "rgba(109,40,217,.04)" : "rgba(139,92,246,.04)"};border-color:${isLight ? "rgba(109,40,217,.15)" : "rgba(139,92,246,.15)"};}
    .wolf-row.sel{background:${isLight ? "rgba(109,40,217,.08)" : "rgba(139,92,246,.08)"};border-color:${isLight ? "rgba(109,40,217,.3)" : "rgba(139,92,246,.3)"};}

    /* PROGRESS */
    .wolf-prog{height:2px;border-radius:1px;background:${isLight ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.04)"};overflow:hidden;}

    /* Pattern badge */
    .pat-badge {
      display:inline-block;padding:1px 6px;border-radius:2px;font-size:8px;
      font-family:'Cinzel',serif;letter-spacing:.5px;font-weight:700;
    }

    /* Copy contract button */
    .copy-btn {
      display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;cursor:pointer;
      font-size:9px;font-family:'Cinzel',serif;letter-spacing:.5px;font-weight:700;
      background:rgba(99,179,237,.06);border:1px solid rgba(99,179,237,.2);color:#63b3ed;
      transition:all .15s;white-space:nowrap;user-select:none;
    }
    .copy-btn:hover{background:rgba(99,179,237,.15);border-color:rgba(99,179,237,.4);}
    .copy-btn:active{transform:scale(.96);}

    /* DApp action link buttons */
    .dapp-link {
      display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:5px;cursor:pointer;
      font-size:9px;font-family:'Cinzel',serif;letter-spacing:1px;font-weight:700;
      text-decoration:none;transition:all .15s;white-space:nowrap;
    }
    .dapp-link.swap{background:rgba(104,211,145,.08);border:1px solid rgba(104,211,145,.25);color:#68d391;}
    .dapp-link.swap:hover{background:rgba(104,211,145,.18);}
    .dapp-link.farm{background:rgba(246,173,85,.08);border:1px solid rgba(246,173,85,.25);color:#f6ad55;}
    .dapp-link.farm:hover{background:rgba(246,173,85,.18);}
    .dapp-link.pool{background:rgba(99,179,237,.08);border:1px solid rgba(99,179,237,.25);color:#63b3ed;}
    .dapp-link.pool:hover{background:rgba(99,179,237,.18);}
    .dapp-link.portal{background:rgba(183,148,244,.08);border:1px solid rgba(183,148,244,.25);color:#b794f4;}
    .dapp-link.portal:hover{background:rgba(183,148,244,.18);}

    /* Action bar for quick actions */
    .action-bar {
      display:flex;gap:6px;flex-wrap:wrap;padding:8px 0;
    }

    /* Sniper pulse for critical liquidity alerts */
    @keyframes sniperPulse { 0%,100%{box-shadow:0 0 8px rgba(34,211,238,.15)}50%{box-shadow:0 0 25px rgba(34,211,238,.5),0 0 50px rgba(16,185,129,.2)} }

    .fade-up { animation:fadeUp .3s ease forwards; }
  `;

  // ══════════════════════════════════════════════════════════════════════════
  // GATE SCREEN
  // ══════════════════════════════════════════════════════════════════════════
  if(screen==="gate"||screen==="paying"){
    const isWaiting=["connecting","paying","verifying"].includes(payStatus);
    return(
      <div className="wolf-app">
        <style>{wolfStyles}</style>
        <div className="wolf-stars"/>
        <div className="scan-line"/>
        <div className="gate-screen">
          <div className="gate-moon">
            <div className="wolf-silhouette">🐺</div>
          </div>
          <div className="gate-title">LONELY WOLF</div>
          <div className="gate-sub">MOTO PACK INTELLIGENCE</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:"clamp(11px,2.5vw,15px)",letterSpacing:6,color:"var(--gold)",textTransform:"uppercase",textAlign:"center",marginTop:6,marginBottom:42,textShadow:"0 0 20px rgba(251,191,36,.3)",fontWeight:700}}>
            « Be a cabal on your own »
          </div>

          <div className="gate-card">
            <div className="wallet-badge">
              <span>🐺</span> OP WALLET REQUIRED
            </div>

            <div className="gate-price">{ACCESS_FEE_DISPLAY}</div>
            <div className="gate-price-sub">ONE-TIME PAYMENT • LIFETIME ACCESS FOR YOUR WALLET</div>

            {/* Payment method selector */}
            <div style={{display:"flex",gap:8,marginBottom:20,justifyContent:"center"}}>
              <button onClick={()=>setPayMethod("btc")} disabled={isWaiting} style={{
                flex:1,padding:"12px 16px",borderRadius:8,cursor:isWaiting?"not-allowed":"pointer",
                background:payMethod==="btc"?"rgba(246,173,85,.12)":"rgba(0,0,0,.4)",
                border:`1px solid ${payMethod==="btc"?"rgba(246,173,85,.4)":"rgba(255,255,255,.06)"}`,
                color:payMethod==="btc"?"#fbbf24":"#6b7280",fontFamily:"Cinzel,serif",fontSize:11,
                fontWeight:700,letterSpacing:1,transition:"all .15s"
              }}>
                <div style={{fontSize:20,marginBottom:4}}>₿</div>
                <div>BTC</div>
                <div style={{fontSize:9,fontWeight:400,marginTop:2,fontFamily:"Crimson Pro,serif",color:payMethod==="btc"?"rgba(251,191,36,.7)":"#4b5563"}}>
                  {safeToNumber(ACCESS_FEE_BTC_SATS).toLocaleString()} sats
                </div>
              </button>
              <button onClick={()=>setPayMethod("moto")} disabled={isWaiting} style={{
                flex:1,padding:"12px 16px",borderRadius:8,cursor:isWaiting?"not-allowed":"pointer",
                background:payMethod==="moto"?"rgba(139,92,246,.12)":"rgba(0,0,0,.4)",
                border:`1px solid ${payMethod==="moto"?"rgba(139,92,246,.4)":"rgba(255,255,255,.06)"}`,
                color:payMethod==="moto"?"#a78bfa":"#6b7280",fontFamily:"Cinzel,serif",fontSize:11,
                fontWeight:700,letterSpacing:1,transition:"all .15s"
              }}>
                <div style={{fontSize:20,marginBottom:4}}>🔥</div>
                <div>MOTO</div>
                <div style={{fontSize:9,fontWeight:400,marginTop:2,fontFamily:"Crimson Pro,serif",color:payMethod==="moto"?"rgba(167,139,250,.7)":"#4b5563"}}>
                  {ACCESS_FEE_MOTO_DISPLAY} MOTO
                </div>
              </button>
            </div>

            <div className="gate-perks">
              {[
                ["🐾","Track 117+ MOTO OG wolves — team, whales & airdrop recipients"],
                ["🐺","Pack pattern detection — coordinated moves, farm migrations, swaps"],
                ["🎯","Liquidity sniper — detect new pools & LP injections early"],
                ["🧠","AI oracle analysis on every wolf and detected pattern"],
                ["🌱","New projects & farms discovery — live OPNet ecosystem scanner"],
                ["♾️","Pay once — access forever with your wallet"],
              ].map(([ico,txt],i)=>(
                <div key={i} className="gate-perk">
                  <span>{ico}</span><span>{txt}</span>
                </div>
              ))}
            </div>

            <button className="pay-btn" onClick={handleConnect} disabled={isWaiting} style={{
              background:payMethod==="moto"
                ?"linear-gradient(135deg,#7c3aed,#a855f7)"
                :"linear-gradient(135deg,#d97706,#f59e0b)",
              borderColor:payMethod==="moto"?"rgba(167,139,250,.4)":"rgba(251,191,36,.4)",
              boxShadow:payMethod==="moto"?"0 0 30px rgba(139,92,246,.35)":"0 0 30px rgba(251,191,36,.25)"
            }}>
              {payStatus==="connecting"?"🔌 CONNECTING WALLET…":
               payStatus==="paying"   ?(payMethod==="moto"?"🔥 SENDING MOTO…":"₿ AWAITING SIGNATURE…"):
               payStatus==="verifying"?"🌕 VERIFYING PAYMENT…":
               payStatus==="done"     ?"✓ ACCESS GRANTED FOREVER — ENTERING…":
                                       payMethod==="moto"?"🔥 PAY WITH MOTO":"₿ PAY WITH BTC"}
            </button>

            {payStatus==="idle"&&(
              <div className="pay-status" style={{color:"#4b5563"}}>
                Powered by OPNet Bitcoin L1 • One payment, lifetime access
              </div>
            )}

            {payStatus==="verifying"&&(
              <div className="pay-status" style={{color:"var(--moon)"}}>
                {payMethod==="moto"?"Confirming MOTO transfer on OPNet…":"Broadcasting to Bitcoin network…"}
                {payTxid&&<div style={{marginTop:6}}>
                  <a href={`${MEMPOOL_TX}${payTxid}`} target="_blank" rel="noreferrer" style={{color:"#3b82f6",textDecoration:"none",fontSize:10}}>↗ View on mempool.space</a>
                </div>}
              </div>
            )}

            {payError&&(
              <div className="pay-error">
                {payError}
                {payTxid&&<div style={{marginTop:8}}>
                  <a href={`${MEMPOOL_TX}${payTxid}`} target="_blank" rel="noreferrer" style={{color:"#3b82f6",textDecoration:"none",fontSize:10}}>↗ Check tx on mempool.space</a>
                  <div style={{fontSize:9,color:"#6b7280",marginTop:4}}>If confirmed, refresh the page and reconnect your wallet.</div>
                </div>}
              </div>
            )}

            {payStatus==="done"&&(
              <div className="pay-status" style={{color:"#68d391",fontFamily:"Cinzel,serif",letterSpacing:2}}>
                🐺 THE PACK AWAITS — ACCESS UNLOCKED FOREVER
              </div>
            )}
          </div>

          <div style={{marginTop:20,fontSize:11,color:"#374151",fontStyle:"italic",textAlign:"center"}}>
            Supports OP Wallet (opnet.org) & UniSat • Bitcoin L1 smart contracts
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN APP
  // ══════════════════════════════════════════════════════════════════════════

  return(
    <ErrorBoundary>
    <div className="wolf-app">
      <style>{wolfStyles}</style>
      <div className="wolf-stars"/>
      <div className="scan-line"/>
      <div className="wolf-wrap">

        {/* HEADER */}
        <header className="wolf-hdr">
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <span style={{fontSize:28,filter:"drop-shadow(0 0 12px rgba(139,92,246,.7))"}}>🐺</span>
            <div>
              <div className="wolf-logo">LONELY WOLF</div>
              <div style={{fontSize:9,color:"var(--fog)",letterSpacing:2,fontFamily:"Cinzel,serif"}}>MOTO OG TRACKER • {wallets.length} WOLVES</div>
            </div>
          </div>
          <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
            <span className="wolf-pill" style={{background:"rgba(139,92,246,.07)",border:"1px solid rgba(139,92,246,.2)",color:"var(--moon)"}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"#68d391",boxShadow:"0 0 6px #68d391",display:"inline-block",animation:"pulse 2s infinite"}}/>
              BLOCK #{blockH.toLocaleString()}
            </span>
            <span className="wolf-pill" style={{background:"rgba(139,92,246,.07)",border:"1px solid rgba(139,92,246,.2)",color:"var(--moon)"}}>🐺 {wallets.length} WOLVES</span>
            {patterns.length>0&&<span className="wolf-pill" style={{background:"rgba(139,92,246,.08)",border:"1px solid rgba(139,92,246,.35)",color:"var(--moon)"}}>🧠 {patterns.length}</span>}
            {alerts.length>0&&<span className="wolf-pill" style={{background:"rgba(248,113,113,.06)",border:"1px solid rgba(248,113,113,.2)",color:"#fc8181"}}>🚨 {alerts.length}</span>}
            <button className={`wolf-btn${autoMode?" ":" ghost"}`} style={autoMode?{background:"rgba(139,92,246,.18)",borderColor:"var(--howl)"}:{}} onClick={()=>setAutoMode(p=>!p)}>
              {autoMode?"⚡ TRACKING":"⚡ IDLE"}
            </button>
            <button className="wolf-btn ghost" style={{fontSize:8}} onClick={toggleTheme} title={isLight?"Switch to dark mode":"Switch to light mode"}>
              {isLight?"🌙":"☀️"}
            </button>
            <div style={{display:"flex",gap:4}}>
              <a className="dapp-link portal" href={DAPP_LINKS.ICHIGAI} target="_blank" rel="noreferrer" style={{padding:"3px 8px",fontSize:8}}>👾 ICHIGAI</a>
              <a className="dapp-link swap" href={DAPP_LINKS.OP_SCAN} target="_blank" rel="noreferrer" style={{padding:"3px 8px",fontSize:8}}>🔍 OP_SCAN</a>
              <a className="dapp-link farm" href={DAPP_LINKS.OPTRACK} target="_blank" rel="noreferrer" style={{padding:"3px 8px",fontSize:8}}>📊 OPTRACK</a>
            </div>
            <button className="wolf-btn ghost" style={{fontSize:8,color:"var(--fog)"}} onClick={()=>setScreen("gate")}>EXIT</button>
          </div>
        </header>

        {/* TABS */}
        <div className="wolf-tabs">
          {[
            ["dashboard","🌕 DEN"],
            ["wallets",`🐾 PACK (${wallets.length})`],
            ["sniper",`🎯 SNIPER (${sniperAlerts.length})`],
            ["patterns",`🧠 SIGNALS (${patterns.length})`],
            ["alerts",`🚨 HOWLS (${alerts.length})`],
            ["graph",`🕸 TRAILS (${interactions.length})`],
            ["analysis","🔬 ORACLE"],
            ["blocks",`⛏ BLOCKS (${blockScanStats.scanned})`],
          ].map(([id,lbl])=>(
            <button key={id} className={`wolf-tab ${tab===id?"on":"off"}`} onClick={()=>setTab(id)}>{lbl}</button>
          ))}
        </div>

        {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
        {tab==="dashboard"&&(
          <div className="fade-up">
            {/* Stats row */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10,marginBottom:14}}>
              {[
                {lbl:"WOLVES",val:wallets.length,sub:"tracked wallets",c:"var(--moon)",bd:"rgba(139,92,246,.2)",ico:"🐺"},
                {lbl:"SNIPER",val:sniperAlerts.length,sub:"liquidity signals",c:"#22d3ee",bd:"rgba(34,211,238,.15)",ico:"🎯"},
                {lbl:"SIGNALS",val:patterns.length,sub:"pack patterns",c:"var(--gold)",bd:"rgba(251,191,36,.15)",ico:"🧠"},
                {lbl:"HOWLS",val:alerts.length,sub:"alerts this session",c:"#63b3ed",bd:"rgba(99,179,237,.15)",ico:"🚨"},
              ].map((s,i)=>(
                <div key={i} style={{background:isLight?"rgba(255,255,255,.9)":"rgba(13,11,18,.95)",border:`1px solid ${s.bd}`,borderRadius:8,padding:"14px 16px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <div style={{fontSize:8,color:s.c,letterSpacing:2,fontFamily:"Cinzel,serif",fontWeight:700}}>{s.lbl}</div>
                    <span style={{fontSize:20}}>{s.ico}</span>
                  </div>
                  <div style={{fontSize:30,fontWeight:700,color:s.c,fontFamily:"Cinzel,serif"}}>{s.val}</div>
                  <div style={{fontSize:10,color:"var(--fog)",marginTop:3,fontStyle:"italic"}}>{s.sub}</div>
                </div>
              ))}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 320px",gap:12}}>
              {/* Pack signals */}
              <div className="wolf-card">
                <div className="wolf-sect">🧠 PACK SIGNALS</div>
                {patterns.length===0?(
                  <div style={{textAlign:"center",padding:"40px 0",color:"var(--fog)"}}>
                    <div style={{fontSize:32}}>🌑</div>
                    <div style={{fontSize:11,marginTop:8,fontStyle:"italic"}}>Silence in the forest<br/>Scan to detect pack movement</div>
                  </div>
                ):patterns.slice(0,6).map(p=>(
                  <div key={p.id} className="wolf-row fade-up" style={{borderLeft:`2px solid ${p.color}`}} onClick={()=>analyzePattern(p)}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{fontSize:11,color:p.color,fontWeight:600}}>{p.label}</span>
                        <span className="pat-badge" style={{background:`${sevC[p.severity]}18`,color:sevC[p.severity],border:`1px solid ${sevC[p.severity]}30`}}>{p.severity}</span>
                      </div>
                      <div style={{fontSize:11,color:"#9ca3af",marginTop:2,lineHeight:1.5}}>{p.detail}</div>
                      <div style={{fontSize:9,color:"var(--muted)",marginTop:2}}>{p.wallets?.length} wolves • {tAgo(p.time)} ago</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* New Projects & Farms */}
              <div className="wolf-card" style={{borderColor:"rgba(16,185,129,.18)"}}>
                <div className="wolf-sect" style={{color:"#10b981"}}>🌱 NEW PROJECTS & FARMS</div>
                <div style={{background:"rgba(16,185,129,.04)",border:"1px solid rgba(16,185,129,.15)",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:8,color:"#10b981",letterSpacing:1,marginBottom:4,fontFamily:"Cinzel,serif",fontWeight:700}}>ECOSYSTEM SCANNER</div>
                  <div style={{fontSize:9,color:"#9ca3af",lineHeight:1.6}}>Auto-detects new contract deployments, staking pools, and farms on OPNet mainnet</div>
                </div>
                {(()=>{
                  const deploys = alerts.filter(a=>a.type==="DEPLOY"||a.type==="CONTRACT");
                  const stakes = alerts.filter(a=>a.type==="STAKE");
                  const newContracts = [...deploys,...stakes].sort((a,b)=>new Date(b.time)-new Date(a.time));
                  if(newContracts.length===0) return(
                    <div style={{textAlign:"center",padding:"20px 0"}}>
                      <div style={{fontSize:28}}>🌱</div>
                      <div style={{fontSize:10,color:"var(--fog)",marginTop:6,fontStyle:"italic"}}>Scan blocks to discover new projects</div>
                    </div>
                  );
                  return newContracts.slice(0,6).map(a=>{
                    const w=wallets.find(x=>x.id===a.wid);
                    const isDeploy=a.type==="DEPLOY";
                    const contractAddr = a.contractAddress || a.txid;
                    return(
                      <div key={a.id} style={{padding:"8px 0",borderBottom:"1px solid rgba(16,185,129,.07)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:11,color:isDeploy?"#b794f4":"#f6ad55",fontWeight:600}}>
                            {isDeploy?"🐾 NEW CONTRACT":"🌿 FARM/STAKE"}
                          </span>
                          <span className="pat-badge" style={{background:isDeploy?"rgba(183,148,244,.12)":"rgba(246,173,85,.12)",color:isDeploy?"#b794f4":"#f6ad55",border:`1px solid ${isDeploy?"rgba(183,148,244,.25)":"rgba(246,173,85,.25)"}`}}>
                            {a.type}
                          </span>
                        </div>
                        <div style={{fontSize:10,color:"#9ca3af",marginTop:2}}>{w?.label||short(a.address)}</div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:3}}>
                          <span style={{fontSize:9,color:"var(--muted)"}}>{fmtBTC(a.value)} • {tAgo(a.time)} ago</span>
                          <a href={`${MEMPOOL_TX}${a.txid}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:9,color:"#3b82f6",textDecoration:"none"}}>↗ {short(a.txid)}</a>
                        </div>
                        {/* Copy contract + action buttons */}
                        <div className="action-bar" style={{marginTop:5}}>
                          <span className="copy-btn" onClick={e=>{e.stopPropagation();copyToClipboard(contractAddr,e.currentTarget);}}>📋 COPY CONTRACT</span>
                          <a className="dapp-link swap" href={DAPP_LINKS.MOTOSWAP_SWAP} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>🔄 SWAP</a>
                          {!isDeploy&&<a className="dapp-link farm" href={DAPP_LINKS.MOTOCHEF} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>🌾 FARM</a>}
                        </div>
                      </div>
                    );
                  });
                })()}
                <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <div style={{background:"rgba(183,148,244,.05)",border:"1px solid rgba(183,148,244,.12)",borderRadius:5,padding:"8px",textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:700,color:"#b794f4",fontFamily:"Cinzel,serif"}}>{alerts.filter(a=>a.type==="DEPLOY").length}</div>
                    <div style={{fontSize:8,color:"var(--muted)",letterSpacing:1,fontFamily:"Cinzel,serif"}}>DEPLOYS</div>
                  </div>
                  <div style={{background:"rgba(246,173,85,.05)",border:"1px solid rgba(246,173,85,.12)",borderRadius:5,padding:"8px",textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:700,color:"#f6ad55",fontFamily:"Cinzel,serif"}}>{alerts.filter(a=>a.type==="STAKE").length}</div>
                    <div style={{fontSize:8,color:"var(--muted)",letterSpacing:1,fontFamily:"Cinzel,serif"}}>FARMS/STAKES</div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div className="wolf-card">
                  <div className="wolf-sect">⚡ HUNT</div>
                  <button className="wolf-btn" style={{width:"100%",marginBottom:8}} onClick={runFullScan} disabled={scanning}>
                    {scanning?`🐾 TRACKING ${scanPct}%`:"🐺 SCAN PACK NOW"}
                  </button>
                  {scanning&&<div className="wolf-prog"><div style={{height:"100%",borderRadius:1,background:"var(--moon)",width:`${scanPct}%`,transition:"width .4s"}}/></div>}
                  <button className="wolf-btn" style={{width:"100%",marginTop:6,background:autoMode?"rgba(139,92,246,.18)":"transparent",borderColor:autoMode?"var(--howl)":"rgba(255,255,255,.06)",color:autoMode?"var(--moon)":"var(--fog)"}} onClick={()=>setAutoMode(p=>!p)}>
                    {autoMode?"🟢 AUTO TRACKING":"🔴 AUTO OFF"}
                  </button>
                  <div style={{marginTop:10,fontSize:10,color:"var(--fog)",lineHeight:1.7,fontStyle:"italic"}}>
                    Auto-scans every {SCAN_INTERVAL/1000}s<br/>
                    Monitors {wallets.length} wolves across {Object.keys(TAGS).length} pack types
                  </div>
                </div>
                <div className="wolf-card">
                  <div className="wolf-sect">🚀 QUICK ACTIONS</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <a className="dapp-link swap" href={DAPP_LINKS.MOTOSWAP_SWAP} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>🔄 SWAP ON MOTOSWAP</a>
                    <a className="dapp-link farm" href={DAPP_LINKS.MOTOCHEF} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>🌾 MOTOCHEF FARMS</a>
                    <a className="dapp-link pool" href={DAPP_LINKS.MOTOSWAP_POOL} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>💧 ADD LIQUIDITY</a>
                    <a className="dapp-link portal" href={DAPP_LINKS.OPNET_PORTAL} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>🟧 OPNET PORTAL</a>
                  </div>
                  <div className="wolf-sect" style={{marginTop:12,marginBottom:6}}>🌐 ECOSYSTEM</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <a className="dapp-link portal" href={DAPP_LINKS.ICHIGAI} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>👾 ICHIGAI — OP20 TRACKER</a>
                    <a className="dapp-link swap" href={DAPP_LINKS.OP_SCAN} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>🔍 OP_SCAN — EXPLORER</a>
                    <a className="dapp-link farm" href={DAPP_LINKS.OPTRACK} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>📊 OPTRACK</a>
                  </div>
                  <div style={{marginTop:8,fontSize:9,color:"var(--fog)",lineHeight:1.6,fontStyle:"italic"}}>
                    See wolf activity → copy contract → swap or farm instantly
                  </div>
                </div>
                <div className="wolf-card">
                  <div className="wolf-sect">📋 KEY CONTRACTS</div>
                  {[
                    {name:"MOTO Token",addr:CONTRACTS.MOTO,c:"#63b3ed"},
                    {name:"Staking",addr:CONTRACTS.STAKING,c:"#f6ad55"},
                    {name:"MotoSwap Router",addr:CONTRACTS.SWAP,c:"#68d391"},
                    {name:"OrangePill Burn",addr:CONTRACTS.BURN,c:"#fc8181"},
                  ].map(ct=>(
                    <div key={ct.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                      <div>
                        <div style={{fontSize:10,color:ct.c,fontWeight:600}}>{ct.name}</div>
                        <div style={{fontSize:8,color:"#374151",fontFamily:"monospace"}}>{ct.addr.slice(0,16)}…</div>
                      </div>
                      <span className="copy-btn" style={{fontSize:8,padding:"2px 6px"}} onClick={e=>copyToClipboard(ct.addr,e.currentTarget)}>📋 COPY</span>
                    </div>
                  ))}
                </div>
                <div className="wolf-card">
                  <div className="wolf-sect">🐾 PACK TYPES</div>
                  {Object.entries(TAGS).map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                      <span style={{fontSize:12}}>{v.icon} <span style={{color:v.color,fontSize:10}}>{v.label}</span></span>
                      <span style={{fontSize:12,fontWeight:700,color:v.color,fontFamily:"Cinzel,serif"}}>{tagC[k]||0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SNIPER — Liquidity Sniping Alerts ────────────────────────── */}
        {tab==="sniper"&&(
          <div className="fade-up" style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:14}}>
            <div>
              <div className="wolf-card">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div className="wolf-sect" style={{color:"#22d3ee",marginBottom:0}}>🎯 LIQUIDITY SNIPER</div>
                  <div style={{display:"flex",gap:6}}>
                    <span style={{fontSize:9,color:"var(--muted)"}}>{sniperAlerts.filter(s=>s.isKnownWolf).length} 🐺 / {sniperAlerts.filter(s=>!s.isKnownWolf).length} 👤</span>
                    <button className="wolf-btn ghost" style={{fontSize:8}} onClick={()=>setSniperAlerts([])}>CLEAR</button>
                  </div>
                </div>
                <p style={{fontSize:11,color:"var(--muted)",marginBottom:14,lineHeight:1.7,fontStyle:"italic"}}>
                  Tracks ALL new pools, liquidity injections & contract launches across OPNet — not just wolves. Identifies if a known OG wolf or unknown address is behind it.
                </p>
                {sniperAlerts.length===0?(
                  <div style={{textAlign:"center",padding:"60px 0"}}>
                    <div style={{fontSize:52}}>🎯</div>
                    <div style={{fontSize:13,color:"var(--moon)",letterSpacing:3,marginTop:12,fontFamily:"Cinzel,serif",fontWeight:700}}>SCANNING ALL ACTIVITY…</div>
                    <div style={{fontSize:11,color:"var(--fog)",marginTop:6,fontStyle:"italic"}}>Run scans to detect new pools, LP events & launches across the entire chain</div>
                    <div style={{marginTop:16}}>
                      <button className="wolf-btn" onClick={runFullScan} disabled={scanning}>{scanning?`🐾 SCANNING…`:"🎯 SCAN NOW"}</button>
                    </div>
                  </div>
                ):sniperAlerts.map(s=>{
                  const sevC={CRITICAL:"#fc8181",HIGH:"#f6ad55",MEDIUM:"#f6e05e",LOW:"#68d391"};
                  const sc=sevC[s.severity]||"#68d391";
                  const contractAddr=s.contractAddress||"";
                  const creatorAddr=s.creator||"";
                  return(
                    <div key={s.id} className="fade-up" style={{padding:"14px 16px",borderRadius:8,marginBottom:8,background:isLight?"rgba(255,255,255,.85)":"rgba(0,0,0,.5)",border:`1px solid ${s.color}25`,borderLeft:`3px solid ${s.color}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <span style={{fontSize:13,fontWeight:700,color:s.color}}>{s.label}</span>
                          <span className="pat-badge" style={{background:`${sc}15`,color:sc,border:`1px solid ${sc}30`}}>{s.severity}</span>
                          {s.isKnownWolf
                            ? <span className="pat-badge" style={{background:"rgba(139,92,246,.1)",color:"var(--moon)",border:"1px solid rgba(139,92,246,.25)"}}>🐺 WOLF</span>
                            : <span className="pat-badge" style={{background:"rgba(156,163,175,.08)",color:"#9ca3af",border:"1px solid rgba(156,163,175,.2)"}}>👤 NEW</span>
                          }
                        </div>
                        <span style={{fontSize:9,color:"var(--muted)",whiteSpace:"nowrap"}}>{tAgo(s.time)}</span>
                      </div>
                      <div style={{fontSize:12,color:isLight?"#374151":"#d1d5db",lineHeight:1.6,marginBottom:8}}>{s.detail}</div>
                      {/* Creator row */}
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                        <span style={{fontSize:8,color:"var(--muted)",letterSpacing:1,fontFamily:"Cinzel,serif"}}>BY:</span>
                        <span style={{fontSize:9,color:s.isKnownWolf?"var(--moon)":"#9ca3af",fontFamily:"monospace"}}>{s.wolfLabel || short(creatorAddr)}</span>
                        {creatorAddr && <span className="copy-btn" style={{fontSize:7,padding:"1px 4px"}} onClick={e=>{e.stopPropagation();copyToClipboard(creatorAddr,e.currentTarget);}}>📋</span>}
                        {s.isKnownWolf && <span style={{fontSize:9,cursor:"pointer",color:"var(--moon)"}} onClick={()=>{const wObj=wallets.find(x=>x.address===creatorAddr);if(wObj)analyzeWallet(wObj);}}>🔬</span>}
                      </div>
                      {/* Contract address */}
                      {contractAddr && <div style={{fontSize:9,color:"#4b5563",fontFamily:"monospace",marginBottom:6}}>{contractAddr.slice(0,36)}{contractAddr.length>36?"…":""}</div>}
                      {s.value>0&&<div style={{fontSize:10,color:"var(--muted)",marginBottom:6}}>Value: {fmtBTC(s.value)}</div>}
                      {/* Action bar */}
                      <div className="action-bar">
                        {contractAddr&&<span className="copy-btn" onClick={e=>{e.stopPropagation();copyToClipboard(contractAddr,e.currentTarget);}}>📋 COPY CONTRACT</span>}
                        <a className="dapp-link swap" href={DAPP_LINKS.MOTOSWAP_SWAP} target="_blank" rel="noreferrer">🔄 SWAP</a>
                        <a className="dapp-link pool" href={DAPP_LINKS.MOTOSWAP_POOL} target="_blank" rel="noreferrer">💧 ADD LP</a>
                        <a className="dapp-link farm" href={DAPP_LINKS.MOTOCHEF} target="_blank" rel="noreferrer">🌾 FARM</a>
                      </div>
                      {/* Participants */}
                      {s.participants?.length>1&&(
                        <div style={{marginTop:8,borderTop:`1px solid ${isLight?"rgba(0,0,0,.06)":"rgba(255,255,255,.04)"}`,paddingTop:6}}>
                          <div style={{fontSize:8,color:"var(--muted)",letterSpacing:1,fontFamily:"Cinzel,serif",marginBottom:4}}>EARLY PARTICIPANTS ({s.participants.length})</div>
                          {s.participants.slice(0,6).map((addr,i)=>{
                            const w=wallets.find(x=>x.address===addr);
                            const isWolf=!!w;
                            const tag=TAGS[w?.tag||"custom"]||TAGS.custom;
                            return(
                              <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3px 0"}}>
                                <span style={{fontSize:10,color:isWolf?tag.color:"#6b7280"}}>{isWolf?tag.icon:"👤"} {w?.label||short(addr)}</span>
                                <div style={{display:"flex",gap:4}}>
                                  <span className="copy-btn" style={{fontSize:7,padding:"1px 4px"}} onClick={e=>{e.stopPropagation();copyToClipboard(addr,e.currentTarget);}}>📋</span>
                                  {isWolf&&<span style={{fontSize:10,cursor:"pointer",color:"var(--moon)"}} onClick={()=>analyzeWallet(w)}>🔬</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Sniper sidebar */}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="wolf-card">
                <div className="wolf-sect">⚡ SNIPE</div>
                <button className="wolf-btn" style={{width:"100%",marginBottom:8}} onClick={runFullScan} disabled={scanning}>
                  {scanning?`🐾 SCANNING ${scanPct}%`:"🎯 SCAN FOR LIQUIDITY"}
                </button>
                <button className="wolf-btn" style={{width:"100%",marginTop:4,background:autoMode?"rgba(16,185,129,.15)":"transparent",borderColor:autoMode?"#10b981":"rgba(255,255,255,.06)",color:autoMode?"#10b981":"var(--fog)"}} onClick={()=>setAutoMode(p=>!p)}>
                  {autoMode?"🟢 AUTO-SNIPING ON":"🔴 AUTO-SNIPE OFF"}
                </button>
                <div style={{marginTop:10,fontSize:10,color:"var(--fog)",lineHeight:1.7,fontStyle:"italic"}}>
                  Auto-scans mempool every {SCAN_INTERVAL/1000}s for ALL new pools, LP events & deploys across the entire OPNet chain
                </div>
              </div>
              <div className="wolf-card">
                <div className="wolf-sect">📊 SNIPER STATS</div>
                {[
                  {lbl:"NEW POOLS",val:sniperAlerts.filter(s=>s.type==="NEW_POOL").length,c:"#22d3ee",ico:"💎"},
                  {lbl:"LP INJECTIONS",val:sniperAlerts.filter(s=>s.type==="LIQ_ADD").length,c:"#06b6d4",ico:"💧"},
                  {lbl:"NEW CONTRACTS",val:sniperAlerts.filter(s=>s.type==="DEPLOY").length,c:"#b794f4",ico:"🚀"},
                  {lbl:"BY WOLVES",val:sniperAlerts.filter(s=>s.isKnownWolf).length,c:"var(--moon)",ico:"🐺"},
                  {lbl:"BY UNKNOWN",val:sniperAlerts.filter(s=>!s.isKnownWolf).length,c:"#9ca3af",ico:"👤"},
                  {lbl:"TOTAL",val:sniperAlerts.length,c:"#22d3ee",ico:"🎯"},
                ].map((s,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${isLight?"rgba(0,0,0,.04)":"rgba(255,255,255,.03)"}`}}>
                    <div style={{fontSize:8,color:"var(--muted)",letterSpacing:.5,fontFamily:"Cinzel,serif"}}>{s.lbl}</div>
                    <div style={{fontSize:14,fontWeight:700,color:s.c,fontFamily:"Cinzel,serif"}}>{s.ico} {s.val}</div>
                  </div>
                ))}
              </div>
              <div className="wolf-card">
                <div className="wolf-sect">🚀 QUICK ACTIONS</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <a className="dapp-link swap" href={DAPP_LINKS.MOTOSWAP_SWAP} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>🔄 SWAP ON MOTOSWAP</a>
                  <a className="dapp-link farm" href={DAPP_LINKS.MOTOCHEF} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>🌾 MOTOCHEF FARMS</a>
                  <a className="dapp-link pool" href={DAPP_LINKS.MOTOSWAP_POOL} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>💧 ADD LIQUIDITY</a>
                  <a className="dapp-link portal" href={DAPP_LINKS.NATIVE_SWAP} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>⚡ NATIVE SWAP</a>
                  <a className="dapp-link portal" href={DAPP_LINKS.ICHIGAI} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>👾 ICHIGAI TRACKER</a>
                  <a className="dapp-link swap" href={DAPP_LINKS.OP_SCAN} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>🔍 OP_SCAN</a>
                  <a className="dapp-link farm" href={DAPP_LINKS.OPTRACK} target="_blank" rel="noreferrer" style={{justifyContent:"center"}}>📊 OPTRACK</a>
                </div>
              </div>
              <div className="wolf-card">
                <div className="wolf-sect">ℹ️ HOW SNIPING WORKS</div>
                <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.8}}>
                  Scans the <strong style={{color:"var(--text)"}}>entire OPNet chain</strong> — not just wolves. Every new pool, every LP injection, every contract deploy. Then tells you if a known OG wolf or unknown address is behind it.
                </div>
                <div style={{fontSize:10,color:isLight?"#374151":"#d1d5db",lineHeight:1.8,marginTop:8}}>
                  💎 <span style={{color:"#22d3ee"}}>New Pool</span> — anyone creates a pool on MotoSwap/NativeSwap<br/>
                  💧 <span style={{color:"#06b6d4"}}>LP Injected</span> — anyone adds liquidity (addLiquidity / listLiquidity)<br/>
                  🚀 <span style={{color:"#b794f4"}}>New Contract</span> — anyone deploys a new smart contract<br/>
                  🐺 <span style={{color:"var(--moon)"}}>Wolf Badge</span> — creator is a tracked OG wolf<br/>
                  👤 <span style={{color:"#9ca3af"}}>Unknown Badge</span> — new address, could be alpha
                </div>
                <div style={{fontSize:10,color:"var(--fog)",lineHeight:1.7,marginTop:8,fontStyle:"italic"}}>
                  See it → copy contract → open MotoSwap → paste → ape before the crowd
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── WALLETS ──────────────────────────────────────────────────────── */}
        {tab==="wallets"&&(
          <div className="fade-up">
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <input className="wolf-inp" style={{flex:1}} placeholder="Search wolf name or address…" value={search} onChange={e=>setSearch(e.target.value)}/>
              <input className="wolf-inp" style={{flex:2}} placeholder="bc1p… add a wolf to track" value={customAddr} onChange={e=>setCustomAddr(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustom()}/>
              <button className="wolf-btn" onClick={addCustom}>+ ADD</button>
            </div>
            <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
              <span style={{fontSize:9,color:"var(--muted)",alignSelf:"center",fontFamily:"Cinzel,serif",letterSpacing:1}}>TYPE:</span>
              {["all",...Object.keys(TAGS)].map(f=>(
                <button key={f} className={`wolf-tab ${filterTag===f?"on":"off"}`} style={{padding:"3px 8px"}} onClick={()=>setFilterTag(f)}>
                  {f==="all"?"ALL":`${TAGS[f]?.icon} ${TAGS[f]?.label}`}
                </button>
              ))}
              <span style={{fontSize:9,color:"var(--muted)",alignSelf:"center",marginLeft:6,fontFamily:"Cinzel,serif",letterSpacing:1}}>TIER:</span>
              {["all",...TIERS.map(t=>t.id)].map(f=>(
                <button key={f} className={`wolf-tab ${filterTier===f?"on":"off"}`} style={{padding:"3px 8px"}} onClick={()=>setFilterTier(f)}>
                  {f==="all"?"ALL":`${TIERS.find(t=>t.id===f)?.icon} ${f.toUpperCase()}`}
                </button>
              ))}
            </div>
            <div className="wolf-card">
              <div className="wolf-sect">{disp.length} WOLVES SHOWN / {wallets.length} TOTAL</div>
              <div style={{maxHeight:580,overflowY:"auto",paddingRight:4}}>
                {disp.map(w=>{
                  const tier=getTier(w.satBalance);
                  const tag=TAGS[w.tag]||TAGS.custom;
                  const links=interactions.filter(i=>i.from===w.address||i.to===w.address).length;
                  const isBurner=w.tag==="moto_burner";
                  return(
                    <div key={w.id} className="wolf-row" onClick={()=>analyzeWallet(w)}>
                      <span style={{fontSize:16}}>{tier.icon}</span>
                      <span style={{fontSize:13}}>{tag.icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:12,color:tag.color,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.label}</span>
                          {w.isNew&&<span className="pat-badge" style={{background:"rgba(99,179,237,.12)",color:"#63b3ed",border:"1px solid rgba(99,179,237,.2)"}}>NEW</span>}
                          {isBurner&&<span className="pat-badge" style={{background:"rgba(248,113,113,.08)",color:"#fc8181",border:"1px solid rgba(248,113,113,.15)"}}>🍊</span>}
                        </div>
                        <div style={{fontSize:9,color:"#374151",fontFamily:"monospace",marginTop:1}}>{short(w.address)}</div>
                        <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                          <span className="pat-badge" style={{background:"rgba(0,0,0,.4)",color:tier.color,border:`1px solid ${tier.color}22`}}>{tier.icon} {tier.label}</span>
                          {links>0&&<span className="pat-badge" style={{background:"rgba(167,139,250,.08)",color:"#b794f4",border:"1px solid rgba(167,139,250,.2)"}}>🕸 {links}</span>}
                          {w.recentTxs[0]&&<span className="pat-badge" style={{background:`${txC[w.recentTxs[0].type]||"#2d3748"}18`,color:txC[w.recentTxs[0].type]||"#6b7280",border:`1px solid ${txC[w.recentTxs[0].type]||"#2d3748"}25`}}>{w.recentTxs[0].type}</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        {w.satBalance&&<div style={{fontSize:11,color:tier.color,fontWeight:600}}>{fmtBTC(w.satBalance)}</div>}
                        {w.alertCount>0&&<div style={{fontSize:9,color:"#fc8181",marginTop:2}}>🚨 {w.alertCount}</div>}
                        <div style={{display:"flex",gap:4,justifyContent:"flex-end",marginTop:2}}>
                          <span className="copy-btn" style={{fontSize:8,padding:"1px 5px"}} onClick={e=>{e.stopPropagation();copyToClipboard(w.address,e.currentTarget);}}>📋</span>
                          <a href={`${MEMPOOL_ADDR}${w.address}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:8,color:"#3b82f6",textDecoration:"none"}}>↗</a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── PATTERNS ─────────────────────────────────────────────────────── */}
        {tab==="patterns"&&(
          <div className="fade-up" style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:14}}>
            <div>
              <div className="wolf-card">
                <div className="wolf-sect">🧠 PACK BEHAVIOR SIGNALS</div>
                <p style={{fontSize:12,color:"var(--muted)",marginBottom:14,lineHeight:1.8,fontStyle:"italic"}}>
                  Monitors {wallets.length} MOTO wolves for coordinated activity — mass buys, den migrations, fire rituals, and more. Signals fire when ≥2–3 wolves act together within 10 minutes.
                </p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                  {Object.values(PATTERNS).map((p,i)=>(
                    <div key={i} style={{background:"rgba(0,0,0,.4)",border:`1px solid ${p.color}18`,borderRadius:6,padding:"8px 10px",borderLeft:`2px solid ${p.color}`}}>
                      <div style={{fontSize:11,color:p.color,fontWeight:600,marginBottom:3}}>{p.label}</div>
                      <div style={{fontSize:10,color:"#6b7280",lineHeight:1.5}}>{p.desc}</div>
                    </div>
                  ))}
                </div>
                <div className="wolf-sect">📡 DETECTED ({patterns.length})</div>
                {patterns.length===0?(
                  <div style={{textAlign:"center",padding:"50px 0",color:"var(--fog)"}}>
                    <div style={{fontSize:40}}>🌑</div>
                    <div style={{fontSize:11,marginTop:8,fontStyle:"italic"}}>The pack is silent<br/>Enable AUTO or scan manually</div>
                  </div>
                ):patterns.map(p=>(
                  <div key={p.id} className="wolf-row fade-up" style={{borderLeft:`3px solid ${p.color}`,marginBottom:6}} onClick={()=>analyzePattern(p)}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:12,color:p.color,fontWeight:700}}>{p.label}</span>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <span className="pat-badge" style={{background:`${sevC[p.severity]}18`,color:sevC[p.severity],border:`1px solid ${sevC[p.severity]}30`}}>{p.severity}</span>
                          <span style={{fontSize:9,color:"var(--muted)"}}>{tAgo(p.time)}</span>
                        </div>
                      </div>
                      <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.5}}>{p.detail}</div>
                      <div style={{marginTop:5,display:"flex",gap:4,flexWrap:"wrap"}}>
                        {(p.wallets||[]).slice(0,4).map(a=>{
                          const w=wallets.find(x=>x.address===a);
                          const tag=TAGS[w?.tag||"custom"]||TAGS.custom;
                          return<span key={a} className="pat-badge" style={{background:"rgba(0,0,0,.5)",border:"1px solid rgba(255,255,255,.07)",color:tag.color}}>{tag.icon} {w?.label||short(a)}</span>;
                        })}
                        {(p.wallets||[]).length>4&&<span style={{fontSize:9,color:"var(--muted)"}}>+{p.wallets.length-4}</span>}
                      </div>
                      <div style={{fontSize:9,color:"#3b82f6",marginTop:4}}>▸ Click to invoke AI oracle</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="wolf-card">
              <div className="wolf-sect">🔮 AI ORACLE</div>
              {patAiLoad?(
                <div style={{textAlign:"center",padding:"40px 0"}}>
                  <div style={{fontSize:40,animation:"pulse 1s infinite"}}>🌕</div>
                  <div style={{fontSize:11,color:"var(--moon)",marginTop:8,fontFamily:"Cinzel,serif",letterSpacing:2}}>READING THE MOON…</div>
                </div>
              ):patAi&&!patAi.error?(
                <div className="fade-up">
                  <div style={{padding:"8px 10px",background:`${patAi.pattern?.color||"var(--moon)"}10`,border:`1px solid ${patAi.pattern?.color||"var(--moon)"}25`,borderRadius:6,marginBottom:10}}>
                    <div style={{fontSize:11,color:patAi.pattern?.color||"var(--moon)",fontWeight:700}}>{patAi.pattern?.label}</div>
                  </div>
                  {patAi._localFallback&&<div style={{marginBottom:10,padding:"5px 10px",background:"rgba(251,191,36,.06)",border:"1px solid rgba(251,191,36,.15)",borderRadius:5,fontSize:9,color:"var(--gold)",letterSpacing:.5}}>⚡ LOCAL ANALYSIS — Claude API unavailable, using on-chain heuristics</div>}
                  {[["THE ORACLE SPEAKS",patAi.interpretation,"#9ca3af"],["SIGNAL",patAi.actionableSignal,"#68d391"],["ACTION",patAi.whatToDo,"var(--gold)"]].map(([l,v,c])=>v&&(
                    <div key={l} style={{marginBottom:10}}>
                      <div style={{fontSize:8,color:c,letterSpacing:1,fontFamily:"Cinzel,serif",fontWeight:700,marginBottom:4}}>{l}</div>
                      <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.7,background:"rgba(0,0,0,.4)",borderRadius:5,padding:"8px 10px"}}>{v}</div>
                    </div>
                  ))}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                    <div style={{background:"rgba(0,0,0,.5)",borderRadius:6,padding:"8px 10px",border:"1px solid rgba(104,211,145,.15)"}}>
                      <div style={{fontSize:8,color:"var(--muted)",marginBottom:2,fontFamily:"Cinzel,serif",letterSpacing:1}}>CONFIDENCE</div>
                      <div style={{fontSize:20,fontWeight:700,color:"#68d391",fontFamily:"Cinzel,serif"}}>{patAi.confidence||"?"}%</div>
                    </div>
                    <div style={{background:"rgba(0,0,0,.5)",borderRadius:6,padding:"8px 10px",border:"1px solid rgba(246,173,85,.15)"}}>
                      <div style={{fontSize:8,color:"var(--muted)",marginBottom:2,fontFamily:"Cinzel,serif",letterSpacing:1}}>TIMEFRAME</div>
                      <div style={{fontSize:10,color:"var(--gold)",lineHeight:1.4}}>{patAi.timeframe||"Soon"}</div>
                    </div>
                  </div>
                  {patAi.nextMoves?.length>0&&(
                    <div>
                      <div style={{fontSize:8,color:"var(--moon)",letterSpacing:1,fontFamily:"Cinzel,serif",fontWeight:700,marginBottom:6}}>WHAT HAPPENS NEXT</div>
                      {patAi.nextMoves.map((m,i)=>(
                        <div key={i} style={{display:"flex",gap:6,fontSize:11,color:"#9ca3af",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                          <span style={{color:"var(--moon)",flexShrink:0}}>{i+1}.</span><span>{m}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ):(
                <div style={{textAlign:"center",padding:"50px 20px",color:"var(--fog)"}}>
                  <div style={{fontSize:36}}>🌑</div>
                  <div style={{fontSize:11,marginTop:8,fontStyle:"italic"}}>Select a pack signal<br/>to consult the oracle</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ALERTS ───────────────────────────────────────────────────────── */}
        {tab==="alerts"&&(
          <div className="fade-up" style={{display:"grid",gridTemplateColumns:"1fr 260px",gap:14}}>
            <div className="wolf-card">
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                <div className="wolf-sect">🚨 PACK HOWLS ({alerts.length})</div>
                <button className="wolf-btn ghost" style={{fontSize:8}} onClick={()=>{setAlerts([]);alertsRef.current=[];}}>CLEAR</button>
              </div>
              {alerts.length===0?(
                <div style={{textAlign:"center",padding:"60px 0",color:"var(--fog)"}}>
                  <div style={{fontSize:36}}>🌙</div>
                  <div style={{fontSize:11,marginTop:8,fontStyle:"italic"}}>The night is quiet — scan to begin</div>
                </div>
              ):alerts.map(a=>{
                const w=wallets.find(x=>x.id===a.wid);
                const tag=TAGS[w?.tag||"custom"]||TAGS.custom;
                const tc=txC[a.type]||"#2d3748";
                const addrToCopy = a.contractAddress || w?.address || a.address;
                return(
                  <div key={a.id} className="fade-up" style={{padding:"10px 12px",borderRadius:7,marginBottom:5,background:"rgba(0,0,0,.4)",borderLeft:`2px solid ${tc}`}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span className="pat-badge" style={{background:`${tc}18`,color:tc,border:`1px solid ${tc}25`}}>{a.type==="BURN"?"🔥 BURN":a.type}</span>
                      <span style={{fontSize:9,color:"var(--muted)"}}>{tAgo(a.time)}</span>
                    </div>
                    <div style={{fontSize:12,color:tag.color,margin:"4px 0",fontWeight:600}}>{tag.icon} {w?.label||short(a.address)}</div>
                    <div style={{fontSize:10,color:"#6b7280"}}>{fmtBTC(a.value)}</div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
                      <a href={`${MEMPOOL_TX}${a.txid}`} target="_blank" rel="noreferrer" style={{fontSize:9,color:"#3b82f6",textDecoration:"none"}}>↗ {short(a.txid)}</a>
                      <span className="copy-btn" onClick={e=>{e.stopPropagation();copyToClipboard(addrToCopy,e.currentTarget);}}>📋 COPY</span>
                      {(a.type==="SWAP"||a.type==="TRANSFER"||a.type==="CONTRACT")&&<a className="dapp-link swap" href={DAPP_LINKS.MOTOSWAP_SWAP} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{padding:"2px 8px"}}>🔄 SWAP</a>}
                      {(a.type==="STAKE")&&<a className="dapp-link farm" href={DAPP_LINKS.MOTOCHEF} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{padding:"2px 8px"}}>🌾 FARM</a>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="wolf-card">
                <div className="wolf-sect">BY TYPE</div>
                {Object.entries(txC).map(([k,c])=>{const cnt=alerts.filter(a=>a.type===k).length;return(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                    <span style={{fontSize:11,color:c}}>{k}</span>
                    <span style={{fontSize:11,color:cnt>0?c:"#374151",fontWeight:cnt>0?700:400,fontFamily:"Cinzel,serif"}}>{cnt}</span>
                  </div>
                );})}
              </div>
              <div className="wolf-card">
                <div className="wolf-sect">BY TIER</div>
                {TIERS.map(t=>{const cnt=alerts.filter(a=>getTier(a.value).id===t.id).length;return(
                  <div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                    <span style={{fontSize:11,color:t.color}}>{t.icon} {t.label}</span>
                    <span style={{fontSize:11,color:cnt>0?t.color:"#374151",fontWeight:cnt>0?700:400,fontFamily:"Cinzel,serif"}}>{cnt}</span>
                  </div>
                );})}
              </div>
            </div>
          </div>
        )}

        {/* ── GRAPH ────────────────────────────────────────────────────────── */}
        {tab==="graph"&&(
          <div className="fade-up" style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:14}}>
            <div className="wolf-card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)"}}>
                <div className="wolf-sect">🕸️ WOLF TRAIL MAP — {interactions.length} CROSSINGS</div>
              </div>
              <WolfGraph wallets={wallets} interactions={interactions} getTier={getTier} TAGS={TAGS} txC={txC}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="wolf-card">
                <div className="wolf-sect">RECENT CROSSINGS</div>
                <div style={{maxHeight:380,overflowY:"auto"}}>
                  {interactions.length===0?<div style={{textAlign:"center",padding:"20px",color:"var(--fog)",fontStyle:"italic",fontSize:11}}>Scan to map wolf trails</div>:
                  interactions.slice(0,25).map(ix=>{
                    const fw=wallets.find(w=>w.address===ix.from);
                    const tw=wallets.find(w=>w.address===ix.to);
                    const tc=txC[ix.type]||"#2d3748";
                    return(
                      <div key={ix.id} style={{padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                        <span className="pat-badge" style={{background:`${tc}18`,color:tc,border:`1px solid ${tc}25`}}>{ix.type}</span>
                        <div style={{fontSize:10,color:"#9ca3af",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fw?.label||short(ix.from)} → {tw?.label||short(ix.to)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="wolf-card">
                <div className="wolf-sect">🐺 MOST CONNECTED</div>
                {wallets.map(w=>({...w,links:interactions.filter(i=>i.from===w.address||i.to===w.address).length}))
                  .filter(w=>w.links>0).sort((a,b)=>b.links-a.links).slice(0,8).map(w=>{
                    const tag=TAGS[w.tag]||TAGS.custom;
                    return(
                      <div key={w.id} className="wolf-row" style={{marginBottom:3}} onClick={()=>analyzeWallet(w)}>
                        <span>{tag.icon}</span>
                        <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,color:tag.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.label}</div></div>
                        <div style={{fontSize:12,fontWeight:700,color:"#b794f4",fontFamily:"Cinzel,serif"}}>🕸 {w.links}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ── AI ANALYSIS ──────────────────────────────────────────────────── */}
        {tab==="analysis"&&(
          <div className="fade-up" style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:14}}>
            <div>
              {!selW?(
                <div className="wolf-card" style={{textAlign:"center",padding:"70px 20px"}}>
                  <div style={{fontSize:52}}>🔮</div>
                  <div style={{fontSize:14,color:"var(--moon)",letterSpacing:3,marginTop:12,fontFamily:"Cinzel,serif",fontWeight:700}}>CONSULT THE ORACLE</div>
                  <div style={{fontSize:11,color:"var(--fog)",marginTop:6,fontStyle:"italic"}}>Select a wolf from the Pack tab for deep analysis</div>
                </div>
              ):aiLoad?(
                <div className="wolf-card" style={{textAlign:"center",padding:"70px 20px"}}>
                  <div style={{fontSize:52,animation:"pulse 1s infinite"}}>🌕</div>
                  <div style={{fontSize:13,color:"var(--moon)",letterSpacing:3,marginTop:12,fontFamily:"Cinzel,serif",fontWeight:700}}>READING {selW.label.toUpperCase()}…</div>
                </div>
              ):aiRes&&!aiRes.error?(()=>{
                const tier=getTier(selW.satBalance);
                const tag=TAGS[selW.tag]||TAGS.custom;
                const lvlC={LOW:"#68d391",MEDIUM:"var(--gold)",HIGH:"#f6ad55",CRITICAL:"#fc8181"}[aiRes.alertLevel]||"#68d391";
                return(
                  <div className="fade-up" style={{background:"rgba(8,7,10,.98)",border:"1px solid var(--border2)",borderRadius:10,padding:20}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <span style={{fontSize:18}}>{tier.icon}</span>
                          <span style={{fontSize:18}}>{tag.icon}</span>
                          <span style={{fontSize:16,color:tag.color,fontWeight:700}}>{selW.label}</span>
                          {selW.tag==="moto_burner"&&<span className="pat-badge" style={{background:"rgba(248,113,113,.08)",color:"#fc8181",border:"1px solid rgba(248,113,113,.15)"}}>🍊 PILL WOLF</span>}
                        </div>
                        <div style={{fontSize:9,color:"#374151",fontFamily:"monospace"}}>{selW.address}</div>
                      </div>
                      <div style={{padding:"5px 12px",borderRadius:4,fontSize:10,fontWeight:700,color:lvlC,background:"rgba(0,0,0,.6)",border:`1px solid ${lvlC}`,fontFamily:"Cinzel,serif",letterSpacing:1}}>{aiRes.alertLevel}</div>
                    </div>
                    {aiRes._localFallback&&<div style={{marginBottom:10,padding:"5px 10px",background:"rgba(251,191,36,.06)",border:"1px solid rgba(251,191,36,.15)",borderRadius:5,fontSize:9,color:"var(--gold)",letterSpacing:.5}}>⚡ LOCAL ANALYSIS — Claude API unavailable, using on-chain heuristics</div>}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
                      {[["SMART MONEY",aiRes.smartMoneyScore,"#68d391"],["RISK",aiRes.riskScore,"#fc8181"]].map(([l,v,c])=>(
                        <div key={l} style={{background:"rgba(0,0,0,.5)",borderRadius:7,padding:12,border:`1px solid ${c}15`}}>
                          <div style={{fontSize:8,color:"var(--muted)",letterSpacing:1,fontFamily:"Cinzel,serif",fontWeight:700,marginBottom:4}}>{l}</div>
                          <div style={{fontSize:28,fontWeight:700,color:c,fontFamily:"Cinzel,serif"}}>{v||0}</div>
                          <div className="wolf-prog"><div style={{height:"100%",borderRadius:1,background:c,width:`${v||0}%`,transition:"width .4s"}}/></div>
                        </div>
                      ))}
                      <div style={{background:"rgba(0,0,0,.5)",borderRadius:7,padding:12,border:"1px solid rgba(99,179,237,.12)"}}>
                        <div style={{fontSize:8,color:"var(--muted)",letterSpacing:1,fontFamily:"Cinzel,serif",fontWeight:700,marginBottom:4}}>ARCHETYPE</div>
                        <div style={{fontSize:10,color:"#63b3ed",lineHeight:1.4,marginTop:4}}>{aiRes.category}</div>
                      </div>
                    </div>
                    {aiRes.burnBehavior&&(
                      <div style={{background:"rgba(248,113,113,.05)",border:"1px solid rgba(248,113,113,.18)",borderRadius:7,padding:12,marginBottom:12}}>
                        <div style={{fontSize:8,color:"#fc8181",letterSpacing:1,fontFamily:"Cinzel,serif",fontWeight:700,marginBottom:4}}>🍊 OG ORIGIN</div>
                        <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.7}}>{aiRes.burnBehavior}</div>
                      </div>
                    )}
                    {[
                      ["ORACLE READING",aiRes.summary,"#3b82f6"],
                      ["PACK CONNECTIONS",aiRes.connectionAnalysis,"#b794f4"],
                      ["TERRITORY INSIGHT",aiRes.tierInsight,tier.color],
                    ].map(([l,v,c])=>v&&(
                      <div key={l} style={{background:"rgba(0,0,0,.4)",borderRadius:7,padding:12,marginBottom:10}}>
                        <div style={{fontSize:8,color:c,letterSpacing:1,fontFamily:"Cinzel,serif",fontWeight:700,marginBottom:5}}>{l}</div>
                        <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.7}}>{v}</div>
                      </div>
                    ))}
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:8,color:"#3b82f6",letterSpacing:1,fontFamily:"Cinzel,serif",fontWeight:700,marginBottom:8}}>PACK SIGNALS</div>
                      {(aiRes.signals||[]).map((s,i)=>(
                        <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.03)",fontSize:11,color:"#9ca3af"}}>
                          <span style={{color:"var(--moon)",flexShrink:0}}>▸</span><span>{s}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{background:"rgba(139,92,246,.05)",border:"1px solid rgba(139,92,246,.2)",borderRadius:7,padding:12}}>
                      <div style={{fontSize:8,color:"var(--moon)",letterSpacing:1,fontFamily:"Cinzel,serif",fontWeight:700,marginBottom:4}}>🐾 NEXT MOVE</div>
                      <div style={{fontSize:13,color:"var(--text)"}}>{aiRes.prediction}</div>
                    </div>
                  </div>
                );
              })():(
                <div className="wolf-card" style={{textAlign:"center",padding:"40px"}}><div style={{fontSize:11,color:"#fc8181"}}>⚠️ Oracle failed — try again</div></div>
              )}
            </div>
            <div className="wolf-card">
              <div className="wolf-sect">SELECT WOLF</div>
              <input className="wolf-inp" style={{width:"100%",marginBottom:8}} placeholder="Filter…" value={search} onChange={e=>setSearch(e.target.value)}/>
              <div style={{maxHeight:560,overflowY:"auto"}}>
                {disp.slice(0,120).map(w=>{
                  const tier=getTier(w.satBalance);const tag=TAGS[w.tag]||TAGS.custom;const isSel=selW?.id===w.id;
                  return(
                    <div key={w.id} className={`wolf-row${isSel?" sel":""}`} onClick={()=>analyzeWallet(w)}>
                      <span style={{fontSize:13}}>{tier.icon}</span>
                      <span style={{fontSize:11}}>{tag.icon}</span>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,color:tag.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{w.label}</div></div>
                      {w.alertCount>0&&<div style={{fontSize:9,color:"#fc8181"}}>🚨{w.alertCount}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── BLOCK-BY-BLOCK SCANNER ──────────────────────────────────────── */}
        {tab==="blocks"&&(
          <div className="fade-up" style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:14}}>
            <div>
              <div className="wolf-card" style={{marginBottom:12}}>
                <div className="wolf-sect">⛏ BLOCK-BY-BLOCK MAINNET SCANNER</div>
                <p style={{fontSize:12,color:"var(--muted)",marginBottom:14,lineHeight:1.8,fontStyle:"italic"}}>
                  Crawl OPNet mainnet blocks sequentially. Every block is checked for transactions involving tracked wolves. Wolf activity is fed into the main tracker automatically.
                </p>
                <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:8,color:"var(--muted)",letterSpacing:1,fontFamily:"Cinzel,serif",marginBottom:4}}>FROM BLOCK</div>
                    <input className="wolf-inp" style={{width:"100%"}} placeholder={`e.g. ${Math.max(blockH-100,0)}`} value={blockScanFrom} onChange={e=>setBlockScanFrom(e.target.value)}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:8,color:"var(--muted)",letterSpacing:1,fontFamily:"Cinzel,serif",marginBottom:4}}>TO BLOCK</div>
                    <input className="wolf-inp" style={{width:"100%"}} placeholder={`e.g. ${blockH}`} value={blockScanTo} onChange={e=>setBlockScanTo(e.target.value)}/>
                  </div>
                  <div style={{paddingTop:16}}>
                    {!blockScanActive?(
                      <button className="wolf-btn" style={{background:"rgba(16,185,129,.1)",borderColor:"rgba(16,185,129,.3)",color:"#10b981"}} onClick={startBlockScan}>
                        ⛏ START SCAN
                      </button>
                    ):(
                      <button className="wolf-btn danger" onClick={stopBlockScan}>
                        ■ STOP
                      </button>
                    )}
                  </div>
                </div>
                {blockScanActive&&(
                  <div style={{marginBottom:10}}>
                    <div className="wolf-prog" style={{height:4,marginBottom:6}}>
                      <div style={{height:"100%",borderRadius:2,background:"linear-gradient(90deg,#10b981,#059669)",width:`${blockScanStats.scanned>0?Math.min((blockScanStats.scanned/Math.max(1,(parseInt(blockScanTo,10)||blockH)-(parseInt(blockScanFrom,10)||(blockH-50))+1))*100,100):0}%`,transition:"width .4s"}}/>
                    </div>
                    <div style={{fontSize:10,color:"var(--moon)",fontFamily:"Cinzel,serif",letterSpacing:1,animation:"pulse 1s infinite"}}>
                      ⛏ SCANNING BLOCK #{blockScanCurrent?.toLocaleString()}…
                    </div>
                  </div>
                )}
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                  <button className="wolf-btn ghost" style={{fontSize:8}} onClick={()=>{setBlockScanFrom(String(Math.max(blockH-50,0)));setBlockScanTo(String(blockH));}}>LAST 50</button>
                  <button className="wolf-btn ghost" style={{fontSize:8}} onClick={()=>{setBlockScanFrom(String(Math.max(blockH-200,0)));setBlockScanTo(String(blockH));}}>LAST 200</button>
                  <button className="wolf-btn ghost" style={{fontSize:8}} onClick={()=>{setBlockScanFrom(String(Math.max(blockH-1000,0)));setBlockScanTo(String(blockH));}}>LAST 1000</button>
                </div>
              </div>

              <div className="wolf-card">
                <div className="wolf-sect">🐺 WOLF HITS IN BLOCKS ({blockScanResults.length})</div>
                {blockScanResults.length===0?(
                  <div style={{textAlign:"center",padding:"50px 0",color:"var(--fog)"}}>
                    <div style={{fontSize:36}}>⛏</div>
                    <div style={{fontSize:11,marginTop:8,fontStyle:"italic"}}>No wolf activity found yet<br/>Start a block scan above</div>
                  </div>
                ):(
                  <div style={{maxHeight:450,overflowY:"auto"}}>
                    {blockScanResults.map((br,i)=>(
                      <div key={`${br.blockNumber}-${i}`} className="wolf-row fade-up" style={{borderLeft:"2px solid #10b981",marginBottom:6}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{fontSize:11,color:"#10b981",fontWeight:700,fontFamily:"Cinzel,serif"}}>BLOCK #{br.blockNumber.toLocaleString()}</span>
                            <span style={{fontSize:9,color:"var(--muted)"}}>{br.totalTxs} total txs</span>
                          </div>
                          <div style={{fontSize:10,color:"#9ca3af",marginBottom:4}}>{br.wolfTxs.length} wolf transaction{br.wolfTxs.length!==1?"s":""}</div>
                          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                            {br.wolfTxs.slice(0,5).map((tx,j)=>{
                              const type=classifyTx(tx);
                              const tc={BURN:"#fc8181",DEPLOY:"#b794f4",STAKE:"#f6ad55",SWAP:"#68d391",TRANSFER:"#63b3ed",CONTRACT:"#fc8181",MOVE:"#6b7280",NEW_POOL:"#22d3ee",LIQ_ADD:"#06b6d4"}[type]||"#6b7280";
                              return(
                                <span key={j} className="pat-badge" style={{background:`${tc}18`,color:tc,border:`1px solid ${tc}25`}}>
                                  {type} • {(tx.involvedWolves||[]).map(a=>{const w=wallets.find(x=>x.address===a);return w?.label||short(a);}).join(", ")}
                                </span>
                              );
                            })}
                            {br.wolfTxs.length>5&&<span style={{fontSize:9,color:"var(--muted)"}}>+{br.wolfTxs.length-5}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="wolf-card">
                <div className="wolf-sect">📊 SCAN STATS</div>
                {[
                  {lbl:"BLOCKS SCANNED",val:blockScanStats.scanned,c:"#10b981",ico:"⛏"},
                  {lbl:"WITH TRANSACTIONS",val:blockScanStats.withTx,c:"#63b3ed",ico:"📦"},
                  {lbl:"WOLF HITS",val:blockScanStats.wolfHits,c:"#fc8181",ico:"🐺"},
                ].map((s,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.03)"}}>
                    <div>
                      <div style={{fontSize:8,color:"var(--muted)",letterSpacing:1,fontFamily:"Cinzel,serif"}}>{s.lbl}</div>
                    </div>
                    <div style={{fontSize:20,fontWeight:700,color:s.c,fontFamily:"Cinzel,serif"}}>{s.ico} {s.val}</div>
                  </div>
                ))}
              </div>
              <div className="wolf-card">
                <div className="wolf-sect">ℹ️ HOW IT WORKS</div>
                <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.8}}>
                  The block scanner crawls OPNet mainnet sequentially, checking each block for transactions that involve any of the {wallets.length} tracked wolves.
                </div>
                <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.8,marginTop:8}}>
                  Wolf hits are automatically fed into the main tracker — alerts, patterns, and the trail graph all update in real-time as blocks are scanned.
                </div>
                <div style={{fontSize:11,color:"#9ca3af",lineHeight:1.8,marginTop:8}}>
                  Scans {BLOCK_SCAN_BATCH} blocks per batch with 300ms delay between batches to avoid overloading the RPC endpoint.
                </div>
                <div style={{marginTop:12,padding:"8px 10px",background:"rgba(139,92,246,.05)",border:"1px solid rgba(139,92,246,.15)",borderRadius:6}}>
                  <div style={{fontSize:8,color:"var(--moon)",letterSpacing:1,fontFamily:"Cinzel,serif",fontWeight:700,marginBottom:4}}>CURRENT TIP</div>
                  <div style={{fontSize:14,color:"var(--moon)",fontWeight:700,fontFamily:"Cinzel,serif"}}>#{blockH.toLocaleString()}</div>
                </div>
              </div>
              <div className="wolf-card">
                <div className="wolf-sect">🔗 MAINNET</div>
                <div style={{fontSize:10,color:"var(--muted)",lineHeight:1.7,fontStyle:"italic"}}>
                  Block scanner targets OPNet mainnet ({RPC}). All blocks are crawled sequentially for wolf activity.
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{marginTop:28,paddingTop:10,borderTop:"1px solid rgba(139,92,246,.04)",display:"flex",justifyContent:"space-between",fontSize:9,color:"#1f2937",fontFamily:"Cinzel,serif",letterSpacing:1}}>
          <span>LONELY WOLF • {wallets.length} OG WOLVES • MOTO TRACKER</span>
          <span>OPNET MAINNET • {new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}

// ─── WOLF TRAIL GRAPH ─────────────────────────────────────────────────────────
function WolfGraph({wallets,interactions,getTier,TAGS,txC}){
  const [focus,setFocus]=useState(null);
  const W=640,H=440;
  const nodes={};
  for(const ix of interactions.slice(0,100)){
    [ix.from,ix.to].forEach(a=>{
      if(!nodes[a]){
        const w=wallets.find(x=>x.address===a);
        nodes[a]={addr:a,label:w?.label||a.slice(0,8),tag:w?.tag||"custom",
          satBalance:w?.satBalance||0,x:Math.random()*540+50,y:Math.random()*360+40};
      }
    });
  }
  const nArr=Object.values(nodes);
  if(!nArr.length) return <div style={{height:440,display:"flex",alignItems:"center",justifyContent:"center",color:"#4b5563",fontSize:11,fontStyle:"italic",fontFamily:"Crimson Pro,serif"}}>🌑 Scan to map wolf trails</div>;
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block",cursor:"crosshair",background:"rgba(8,7,10,.6)"}}>
      <defs>
        <filter id="wolfGlow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="wolfBg" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(139,92,246,.04)"/><stop offset="100%" stopColor="transparent"/></radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#wolfBg)"/>
      {interactions.slice(0,80).map((ix,i)=>{
        const f=nodes[ix.from],t=nodes[ix.to];if(!f||!t)return null;
        return<line key={i} x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke={txC[ix.type]||"#2d3748"} strokeWidth={ix.value>1e8?2:1} strokeOpacity={.25} strokeDasharray={ix.type==="MOVE"?"5,3":"none"}/>;
      })}
      {nArr.map((n,i)=>{
        const tier=getTier(n.satBalance);const tag=TAGS[n.tag]||TAGS.custom;
        const r=n.satBalance>5e9?12:n.satBalance>1e9?9:6;const isFocus=focus===n.addr;
        return(
          <g key={i} onClick={()=>setFocus(isFocus?null:n.addr)} style={{cursor:"pointer"}}>
            <circle cx={n.x} cy={n.y} r={r+6} fill="transparent"/>
            {isFocus&&<circle cx={n.x} cy={n.y} r={r+8} fill="none" stroke="rgba(196,181,253,.25)" strokeWidth={1} strokeDasharray="3,3"/>}
            <circle cx={n.x} cy={n.y} r={r} fill="rgba(13,11,18,.8)"
              stroke={n.tag==="moto_burner"?"#fc8181":isFocus?"#c4b5fd":tier.color||"#4b5563"}
              strokeWidth={isFocus?2.5:1} filter={isFocus?"url(#wolfGlow)":"none"} opacity={.9}/>
            {isFocus&&<text x={n.x} y={n.y+r+12} textAnchor="middle" fontSize={8} fill={tag.color} fontFamily="Cinzel,serif" fontWeight="700">{n.label.slice(0,14)}</text>}
          </g>
        );
      })}
    </svg>
  );
}
