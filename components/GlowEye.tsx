"use client";
import { useEffect, useRef, useState } from "react";
import { Finding, LABEL, Product, buyUrl, hasPrices, list, recommend, weakConcerns } from "@/lib/recommend";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const NUM: Record<string, number> = { one: 1, a: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const KEYS = "Keyboard: A to analyse, R for recommendations, B to buy, X for next product, P to repeat, S to stop, Y or N to answer, Enter to open the store page, L to restart listening.";

export default function GlowEye() {
  const [started, setStarted] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const rec = useRef<any>(null);
  const spk = useRef(0);
  const s = useRef({
    consent: false, busy: false, findings: null as Finding[] | null, recs: [] as { product: Product; reasons: string[] }[], idx: 0,
    last: "", spoken: "", speaking: false, rate: 1, allergies: [] as string[], budget: null as number | null,
    mode: "idle" as "idle" | "quantity" | "confirm", qty: 1, pending: "", listening: false,
  });

  function speak(text: string, remember = true) {
    return new Promise<void>(res => {
      const st = s.current, id = ++spk.current;
      if (remember) st.last = text;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = st.rate; u.lang = navigator.language || "en-US";
      st.speaking = true; st.spoken = text.toLowerCase();
      u.onend = u.onerror = () => { if (spk.current === id) st.speaking = false; res(); };
      speechSynthesis.speak(u);
    });
  }
  const stopSpeaking = () => { spk.current++; s.current.speaking = false; speechSynthesis.cancel(); };

  // ---------- Camera ----------
  async function framing() {
    const FD = (window as any).FaceDetector, v = video.current!;
    if (!FD) { await speak("Hold the phone at arm's length, face forward, forehead uncovered. Capturing in three, two, one.", false); return true; }
    const fd = new FD({ fastMode: true, maxDetectedFaces: 1 });
    await speak("Face the camera with your forehead uncovered.", false);
    for (let i = 0; i < 10; i++) {
      const f = await fd.detect(v).catch(() => []);
      if (!f.length) await speak("I can't see your face.", false);
      else {
        const r = f[0].boundingBox.width / v.videoWidth;
        if (r < 0.6) await speak("Move the phone closer.", false);
        else if (r > 0.92) await speak("Move the phone a little farther away.", false);
        else { await speak("Hold still. Three, two, one.", false); return true; }
      }
      await sleep(1000);
    }
    return false;
  }
  const capture = () => new Promise<Blob | null>(res => {
    const v = video.current!, c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob(res, "image/jpeg", 0.9);
  });

  // ---------- Actions ----------
  async function analyse() {
    const st = s.current;
    if (!st.consent) return void speak("I need your consent first. Say I agree to let me take one photo and send it to YouCam for analysis.");
    if (st.busy) return;
    st.busy = true;
    try {
      if (!(await framing())) return void (await speak("I couldn't get your face in frame. Say analyse my skin to try again."));
      const blob = await capture();
      if (!blob) throw new Error("I couldn't capture the photo.");
      void speak("Photo taken. Analysing now. This can take up to a minute.", false);
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "The analysis failed.");
      st.findings = data.findings; st.recs = []; st.idx = 0;
      const weak = weakConcerns(st.findings!);
      const body = !st.findings!.length ? "YouCam returned no usable results. Please try again in better light."
        : weak.length ? `YouCam's results indicate ${list(weak.map(w => LABEL[w.type]))}. Let's find skincare products that may help support your skin.`
        : "YouCam did not flag any concern below the level I treat as needing attention.";
      await speak(`Your skin analysis is complete. ${body} This is cosmetic guidance, not a medical diagnosis. Say recommend skincare to hear suggestions.`);
    } catch (e: any) {
      await speak(`${e.message} Say analyse my skin to try again.`);
    } finally { st.busy = false; }
  }

  function describe() {
    const st = s.current, r = st.recs[st.idx];
    if (!r) return;
    const p = r.product;
    const price = p.price != null ? `It costs ${p.price} dollars.` : "I don't have a verified price for it, so please check the price at the store.";
    void speak(`${st.idx + 1} of ${st.recs.length}. ${p.brand} ${p.name}, ${p.purpose}. Suggested because of ${list(r.reasons)}. Key ingredients: ${list(p.keyIngredients)}. ${price} Say I want to buy it, or say next for another suggestion.`);
  }
  function recommendNow() {
    const st = s.current;
    if (!st.findings) return void speak("I need to analyse your skin first. Say analyse my skin.");
    st.recs = recommend(st.findings, { allergies: st.allergies, budget: st.budget }); st.idx = 0;
    if (!st.recs.length) return void speak("I don't have a suitable product in my small catalogue for those results and preferences.");
    describe();
  }
  function startBuy() {
    const st = s.current, r = st.recs[st.idx];
    if (!r) return void speak("There's no product selected yet. Say recommend skincare first.");
    st.mode = "quantity";
    void speak(`${r.product.brand} ${r.product.name}. How many would you like? Say a number. Delivery details are entered at the store, I don't collect your address.`);
  }
  function openStore() {
    const st = s.current;
    if (!st.pending) return;
    const w = window.open(st.pending, "_blank");
    if (w) { w.opener = null; st.pending = ""; void speak("I've opened the store page. I can't see your order, so the store itself must confirm it and any payment.", false); }
    else void speak("Your browser blocked the page. Tap the screen or press Enter to open it.", false);
  }

  // ---------- Voice commands ----------
  function handle(t: string) {
    const st = s.current;
    if (/\bstop\b|be quiet|shut up/.test(t)) return stopSpeaking();
    if (/repeat|say that again/.test(t)) return void speak(st.last || "There's nothing to repeat yet.", false);
    if (/slower/.test(t)) { st.rate = Math.max(0.6, st.rate - 0.2); return void speak("Okay, I'll speak slower."); }
    if (/faster/.test(t)) { st.rate = Math.min(1.6, st.rate + 0.2); return void speak("Okay, I'll speak faster."); }
    const yes = /\b(yes|yeah|yep|confirm|i agree|agree|i consent|consent|okay|ok)\b/.test(t), no = /\b(no|nope|cancel|decline|don't)\b/.test(t);
    if (!st.consent && (yes || no)) {
      if (no) return void speak("No problem. I won't take any photo. Say I agree whenever you're ready.");
      st.consent = true; return void speak("Thank you. Say analyse my skin when you're ready.");
    }
    if (st.mode === "quantity") {
      const n = parseInt(t.match(/\d+/)?.[0] ?? "") || t.split(/\s+/).map(w => NUM[w]).find(Boolean);
      if (no) { st.mode = "idle"; return void speak("Cancelled."); }
      if (!n || n < 1 || n > 10) return void speak("Please say a number from one to ten.");
      st.qty = n; st.mode = "confirm";
      const p = st.recs[st.idx].product, total = p.price != null ? ` Total ${(p.price * n).toFixed(2)} dollars before delivery.` : " I don't have a verified price.";
      return void speak(`Order summary: ${n} of ${p.brand} ${p.name}.${total} I can't place the order or take payment myself. If you confirm, I'll open a store search page for this product where you complete checkout. Say yes to open it, or no to cancel.`);
    }
    if (st.mode === "confirm") {
      if (no) { st.mode = "idle"; return void speak("Cancelled. Nothing was ordered."); }
      if (yes) { st.mode = "idle"; st.pending = buyUrl(st.recs[st.idx].product); return openStore(); }
    }
    const al = t.match(/(?:allergic|allergy|sensitive|sensitivity) to ([a-z ]+)/);
    if (al) {
      st.allergies.push(...al[1].split(/ and |,/).map(x => x.trim()).filter(Boolean));
      void speak(`Noted. I'll avoid products with ${list(st.allergies)} in their key ingredients. I only check key ingredients, not full ingredient lists, so please read the label.`);
      return;
    }
    const bud = t.match(/budget.*?(\d+)|under (\d+)/);
    if (bud) {
      if (!hasPrices) return void speak("I've noted your budget, but my catalogue has no verified prices, so I can't filter by it.");
      st.budget = Number(bud[1] ?? bud[2]); return void speak(`Okay, a budget of ${st.budget} dollars.`);
    }
    if (/analy[sz]e|about my skin|scan/.test(t)) return void analyse();
    if (/\bnext\b|another/.test(t) && st.recs.length) { st.idx = (st.idx + 1) % st.recs.length; return describe(); }
    if (/recommend|product|skincare|skin care/.test(t)) return recommendNow();
    if (/buy|purchase|order/.test(t)) return startBuy();
    void speak("You can say analyse my skin, recommend skincare, I want to buy it, repeat that, speak slower, or stop speaking.", false);
  }
  const handleRef = useRef(handle);
  handleRef.current = handle;

  function onHeard(t: string) {
    const st = s.current;
    if (st.speaking) {
      // ignore my own voice echoing back, but let real interruptions through
      if (!/\bstop\b/.test(t) && st.spoken.includes(t)) return;
      stopSpeaking();
    }
    handleRef.current(t);
  }
  function listen() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return void speak(`Speech recognition isn't available in this browser. ${KEYS}`);
    rec.current?.stop?.();
    const r = new SR();
    r.continuous = true; r.interimResults = false; r.lang = navigator.language || "en-US";
    r.onresult = (e: any) => onHeard(e.results[e.results.length - 1][0].transcript.trim().toLowerCase());
    r.onend = () => { if (s.current.listening) try { r.start(); } catch {} };
    r.onerror = (e: any) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { s.current.listening = false; void speak(`Microphone use was denied. ${KEYS}`); } };
    s.current.listening = true; rec.current = r;
    try { r.start(); } catch {}
  }

  async function start() {
    setStarted(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1440 } }, audio: true });
      stream.getAudioTracks().forEach(t => t.stop()); // mic permission is granted; recognition manages its own mic
      video.current!.srcObject = stream; await video.current!.play();
    } catch { return void speak("I need camera and microphone access. Please allow both in your browser settings and reload the page."); }
    await speak("Welcome to Glow A-eye. Your camera is on. When you ask me to analyse your skin, I take one photo and send it securely to the YouCam skin analysis service. I don't save your photo; YouCam keeps results temporarily. Say I agree to give consent, or no to decline. You can then say analyse my skin, recommend skincare, or I want to buy it. Say stop to interrupt me.", false);
    listen();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started) return;
      const k = e.key.toLowerCase(), m: Record<string, string> = { a: "analyse my skin", r: "recommend skincare", b: "i want to buy it", x: "next product", p: "repeat that", s: "stop", y: "yes", n: "no" };
      if (k === "enter" && s.current.pending) return openStore();
      if (k === "l") return listen();
      if (m[k]) { if (k === "y" && !s.current.consent) s.current.consent = false; handleRef.current(m[k]); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); s.current.listening = false; rec.current?.stop?.(); speechSynthesis.cancel(); };
  }, [started]);

  return (
    <main aria-label="Glow A-eye voice skincare assistant" className="fixed inset-0 bg-black" onPointerDown={() => started && openStore()}>
      <video ref={video} playsInline muted aria-label="Live camera preview" className="h-full w-full -scale-x-100 object-cover" />
      {!started && (
        <button autoFocus onClick={start} className="absolute inset-0 z-10 h-full w-full opacity-0 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-white"
          aria-label="Glow A-eye, a voice skincare assistant. Double tap anywhere, or press Enter, to start. It will ask to use your camera and microphone." />
      )}
    </main>
  );
}
