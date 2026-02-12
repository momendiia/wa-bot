import express from "express";
import axios from "axios";
import { getStage, setStage, resetStage } from "./db.js";

const app = express();
app.use(express.json());

// ====== ENV ======
const {
  PORT = 3000,
  VERIFY_TOKEN = "verify_token", // حط نفس القيمة الموجودة في Meta Webhook Verify Token
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
} = process.env;

if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
  console.error("Missing env vars: WHATSAPP_TOKEN and/or PHONE_NUMBER_ID");
}

// ====== Helpers ======
function normalizePhone(from) {
  // from بيجي مثل "9705xxxxxxx"
  return String(from || "").trim();
}

async function sendText(to, text) {
  const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function sendMenu(to) {
  // قائمة أساسية احترافية
  const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "أهلًا 👋✨\nأهلاً في *Aqib Digital Store*.\nاختر الخدمة اللي بدك إياها:",
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: "SUB_DETAILS", title: "📌 تفاصيل الاشتراك" },
            },
            {
              type: "reply",
              reply: { id: "TALK_SUPPORT", title: "🛠️ التحدث مع الدعم" },
            },
          ],
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function sendPlans(to) {
  const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text:
            "🔥 *عروض اشتراكات ChatGPT* — اختر الباقة المناسبة:\n\n" +
            "⭐ ChatGPT Business (20 شيكل/شهر)\n" +
            "⭐ ChatGPT Plus (30 شيكل/شهر)\n" +
            "💎 Plus جاهز (15 شيكل) — حساب جاهز\n\n" +
            "اختر واحدة:",
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "PLAN_BUSINESS_20", title: "🔥 Business - 20" } },
            { type: "reply", reply: { id: "PLAN_PLUS_30", title: "⭐ Plus - 30" } },
            { type: "reply", reply: { id: "PLAN_READY_15", title: "💎 Plus 15 - جاهز" } },
          ],
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function askForEmail(to) {
  await sendText(
    to,
    "تمام ✅\nابعت *الإيميل* اللي بدك نفعّل عليه الاشتراك (اكتب الإيميل هنا)."
  );
}

function isValidEmail(text) {
  const t = String(text || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

// ====== Webhook Verify (GET) ======
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ====== Webhook Receive (POST) ======
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // status updates / irrelevant payload
    const msg = value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = normalizePhone(msg.from);

    // ====== STOP RESPONDING IF DONE ======
    const stage = getStage(from);
    if (stage === "done") {
      return res.sendStatus(200);
    }

    // Identify message type
    const msgType = msg.type;

    // ====== Handle Interactive Buttons ======
    if (msgType === "interactive") {
      const buttonId =
        msg?.interactive?.button_reply?.id ||
        msg?.interactive?.list_reply?.id ||
        "";

      // Main menu actions
      if (buttonId === "SUB_DETAILS") {
        // show plans
        setStage(from, "choosing_plan");
        await sendPlans(from);
        return res.sendStatus(200);
      }

      if (buttonId === "TALK_SUPPORT") {
        // you can set done immediately or keep it open
        setStage(from, "support");
        await sendText(from, "أكيد 🛠️\nاكتب سؤالك هون وبنرجعلك بأقرب وقت.");
        return res.sendStatus(200);
      }

      // Plan 선택
      if (
        buttonId === "PLAN_BUSINESS_20" ||
        buttonId === "PLAN_PLUS_30" ||
        buttonId === "PLAN_READY_15"
      ) {
        // بعد اختيار الباقة: اطلب الإيميل وبعدين لما يصل الإيميل سكّر (done)
        setStage(from, `awaiting_email:${buttonId}`);
        await askForEmail(from);
        return res.sendStatus(200);
      }

      return res.sendStatus(200);
    }

    // ====== Handle Text Messages ======
    if (msgType === "text") {
      const text = msg?.text?.body?.trim() || "";

      // Commands for admin reset (اختياري)
      if (text.toLowerCase() === "/reset") {
        resetStage(from);
        await sendText(from, "تم ✅ رجّعنا حالتك للبداية.");
        await sendMenu(from);
        return res.sendStatus(200);
      }

      // Start flow
      if (stage === "start") {
        setStage(from, "menu");
        await sendMenu(from);
        return res.sendStatus(200);
      }

      // Email capture stage
      if (stage.startsWith("awaiting_email:")) {
        if (!isValidEmail(text)) {
          await sendText(from, "الإيميل مش واضح 😅\nابعت الإيميل بالشكل الصحيح مثال: name@gmail.com");
          return res.sendStatus(200);
        }

        const chosen = stage.split(":")[1]; // PLAN_BUSINESS_20 ...
        let planName = "غير محدد";
        if (chosen === "PLAN_BUSINESS_20") planName = "ChatGPT Business (20 شيكل/شهر)";
        if (chosen === "PLAN_PLUS_30") planName = "ChatGPT Plus (30 شيكل/شهر)";
        if (chosen === "PLAN_READY_15") planName = "Plus جاهز (15 شيكل)";

        // رسالة نهائية احترافية + قفل الحالة DONE
        await sendText(
          from,
          `تمام 💎\nسجّلنا طلبك:\n• الباقة: *${planName}*\n• الإيميل: *${text}*\n\n✅ *الدفع بعد التفعيل*\nونقبل الدفع عبر *كافة البنوك* و*المحافظ الإلكترونية*.\n\nراح يتواصل معك الدعم لتأكيد التفاصيل.`
        );

        setStage(from, "done"); // <-- هذا اللي بدك ياه: بعدها ما يرد
        return res.sendStatus(200);
      }

      // If user is in menu/choosing_plan/support and sends text:
      // خليه يرجّعه للمنيو بدل ما يضل ضايع
      if (stage === "menu" || stage === "choosing_plan") {
        await sendText(from, "للاختيار بسرعة ✅ اضغط أحد الأزرار من القائمة.");
        await sendMenu(from);
        return res.sendStatus(200);
      }

      // Support stage: لا تسكر، بس خليه يرد مرة ويقول استلمنا
      if (stage === "support") {
        await sendText(from, "تم استلام رسالتك ✅\nراح نرد عليك بأقرب وقت.");
        // إذا بدك تسكّر بعد أول رسالة دعم:
        // setStage(from, "done");
        return res.sendStatus(200);
      }

      // fallback
      await sendMenu(from);
      return res.sendStatus(200);
    }

    // Other message types
    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err?.response?.data || err.message);
    return res.sendStatus(200);
  }
});

// Health check
app.get("/", (req, res) => res.send("OK"));

app.listen(PORT, () => console.log(`Running on ${PORT}`));
