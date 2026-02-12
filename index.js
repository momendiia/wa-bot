import express from "express";
import axios from "axios";
import { initDB, getUser, updateUser, resetUser } from "./db.js";

const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "aqib_verify_123";

const GRAPH_URL = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

// ========= مساعدات =========
function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

async function sendMessage(to, text) {
  return axios.post(
    GRAPH_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

async function sendButtons(to, bodyText, buttons) {
  // buttons: [{id, title}]
  return axios.post(
    GRAPH_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

function welcomeText() {
  return `✨👋 أهلًا بك في *Nova Store*  
كيف فينا نساعدك اليوم؟`;
}

function menuButtons() {
  return [
    { id: "SUB_DETAILS", title: "📌 تفاصيل الاشتراك" },
    { id: "SUPPORT", title: "🛠️ التحدث مع الدعم" },
  ];
}

function plansText() {
  return `🔥 *عروض اشتراكات ChatGPT* — اختر الباقة المناسبة لك:

⭐ *ChatGPT Business* (20 شيكل / شهر)
- محادثات جديدة بدون قيود
- يدعم وضع Pro
- صور بعدد كبير جدًا

⭐ *ChatGPT Plus* (30 شيكل / شهر)
- ملاحظة: التفعيل يتم عبر بيانات دخول مؤقتة (الإيميل + كلمة المرور)
- صور (قد تكون محدودة حسب الضغط)

💎 *حساب Plus جاهز من عندنا* (15 شيكل)
- إيميل + باسورد جاهزين`;
}

function planButtons() {
  return [
    { id: "PLAN_BUSINESS", title: "🔥 Business - 20" },
    { id: "PLAN_PLUS", title: "⭐ Plus - 30" },
    { id: "PLAN_READY", title: "💎 Plus 15 - جاهز" },
  ];
}

function afterPlanText(planName) {
  return `تمام ✅ اخترت: *${planName}*  

📩 ابعت الإيميل اللي بدك نفعل عليه الاشتراك (إن وجد).  
أو اكتب *جاهز* إذا بدك تواصل مباشر مع الدعم.

⚠️ ملاحظة: بعد اختيار الباقة سيتم تحويلك للدعم ولن يتم الرد تلقائيًا.`;
}

// ========= Webhook Verification =========
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ========= Webhook Receive =========
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const messages = value?.messages;
    if (!messages || messages.length === 0) {
      return res.sendStatus(200);
    }

    const msg = messages[0];
    const from = normalizePhone(msg.from);

    const user = await getUser(from);

    // ✅ لو المستخدم خلص اختياره (finished) لا ترد عليه أبداً
    if (user.finished === true) {
      return res.sendStatus(200);
    }

    // ========= لو Interactive Button =========
    if (msg.type === "interactive") {
      const buttonId = msg.interactive?.button_reply?.id;

      // START MENU
      if (buttonId === "SUB_DETAILS") {
        await updateUser(from, { step: "plans" });
        await sendMessage(from, plansText());
        await sendButtons(from, "أي نوع حاب تشترك فيه؟ ✅", planButtons());
        return res.sendStatus(200);
      }

      if (buttonId === "SUPPORT") {
        await updateUser(from, { finished: true, step: "support" });
        await sendMessage(
          from,
          `تمام 👌 تم تحويلك للدعم الآن.\nرح يتم الرد عليك قريبًا 💬`
        );
        return res.sendStatus(200);
      }

      // PLANS
      if (buttonId === "PLAN_BUSINESS") {
        await updateUser(from, {
          step: "plan_selected",
          plan: "ChatGPT Business - 20",
        });

        await sendMessage(from, afterPlanText("ChatGPT Business - 20"));
        // 👇 هنا نخلي البوت "يوقف" بعد الاختيار (حسب طلبك)
        await updateUser(from, { finished: true });
        return res.sendStatus(200);
      }

      if (buttonId === "PLAN_PLUS") {
        await updateUser(from, {
          step: "plan_selected",
          plan: "ChatGPT Plus - 30",
        });

        await sendMessage(from, afterPlanText("ChatGPT Plus - 30"));
        await updateUser(from, { finished: true });
        return res.sendStatus(200);
      }

      if (buttonId === "PLAN_READY") {
        await updateUser(from, {
          step: "plan_selected",
          plan: "Plus جاهز - 15",
        });

        await sendMessage(from, afterPlanText("Plus جاهز - 15"));
        await updateUser(from, { finished: true });
        return res.sendStatus(200);
      }
    }

    // ========= لو رسالة نصية =========
    if (msg.type === "text") {
      const text = msg.text?.body?.trim() || "";

      // أوامر ادارية بسيطة
      if (text === "/reset") {
        await resetUser(from);
        await sendMessage(from, "تم تصفير حالتك بنجاح ✅");
        await sendButtons(from, welcomeText(), menuButtons());
        return res.sendStatus(200);
      }

      // أول مرة
      if (user.step === "start") {
        await updateUser(from, { step: "menu" });
        await sendButtons(from, welcomeText(), menuButtons());
        return res.sendStatus(200);
      }

      // لو المستخدم كتب "تفاصيل الاشتراك"
      if (text.includes("تفاصيل")) {
        await sendMessage(from, plansText());
        await sendButtons(from, "أي نوع حاب تشترك فيه؟ ✅", planButtons());
        return res.sendStatus(200);
      }

      // افتراضي: رجّعه للقائمة
      await sendButtons(from, welcomeText(), menuButtons());
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err?.response?.data || err.message);
    return res.sendStatus(200);
  }
});

// ========= Health Check =========
app.get("/", (req, res) => {
  res.send("WA Bot is running ✅");
});

// ========= Start Server =========
await initDB();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on", PORT));
