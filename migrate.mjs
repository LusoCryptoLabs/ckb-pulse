// Moving the address (2026-11-18): pulse-lab.lusocryptolabs.com became pulse.lusocryptolabs.com. A browser keeps its
// settings per address, so a visit that came through the old one would start with none: no language, no look, none of the
// projects it follows, the welcome card again. The old address holds no page. It answers a browser with a small page that
// reads this app's own keys and sends them in the fragment of the redirect (a fragment never reaches a server), and every
// page here takes them in before anything is drawn: only these keys, only text of a sane size, and never over something
// the new address already holds. Notices on a phone cannot move: they are tied to the address and are turned on again.
export const KEYS = ['lang', 'seen', 'theme', 'view', 'ui', 'follows', 'seenNews'].map((k) => `ckbpulse.${k}`)
const LIMIT = 8000 // characters of payload, far under what a browser accepts in a fragment

// the receiver, at the top of every page's head
export const MIGRATE_SCRIPT = `<script>(function(){try{var h=location.hash;if(h.indexOf('#ckbmigrate=')!==0)return;var j=JSON.parse(decodeURIComponent(escape(atob(h.slice(12).replace(/-/g,'+').replace(/_/g,'/')))));var ok=${JSON.stringify(KEYS)};for(var i=0;i<ok.length;i++){var k=ok[i];if(Object.prototype.hasOwnProperty.call(j,k)&&typeof j[k]==='string'&&j[k].length<20000&&localStorage.getItem(k)===null)localStorage.setItem(k,j[k])}var o=typeof j['#']==='string'&&j['#'].charAt(0)==='#'?j['#'].slice(0,200):'';history.replaceState(null,'',location.pathname+location.search+o)}catch(e){}})()</script>`

// the sender: the page the old address gives a browser. `to` is the new origin
export function legacyPage(to) {
  const host = to.replace(/^https?:\/\//, '')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CKB Pulse</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#121212;color:#F4F1EB;font:16px system-ui,sans-serif"><p>CKB Pulse &middot; <a style="color:inherit" href="${to}">${host}</a></p>
<script>(function(){var K=${JSON.stringify(KEYS)},o={};try{for(var i=0;i<K.length;i++){var v=localStorage.getItem(K[i]);if(v!==null)o[K[i]]=v}}catch(e){}var n=Object.keys(o).length,h=location.hash;if(h&&n)o['#']=h;var f='';try{var s=JSON.stringify(o);if(n&&s.length<${LIMIT})f='#ckbmigrate='+btoa(unescape(encodeURIComponent(s))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');else if(h)f=h}catch(e){f=h}location.replace('${to}'+location.pathname+location.search+f)})()</script></body></html>
`
}
