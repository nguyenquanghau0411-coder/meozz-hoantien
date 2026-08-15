/**
 * Chuyển link sản phẩm TikTok Shop → affiliate link qua RioHub API
 * (POST /partner/tiktok/affiliate/product-links) — port 1:1 từ
 * tiktok_process_and_commission() trong bot_v48_spf.py.
 *
 * Docs: https://riohub.vn/api/v1
 *
 * ⚠️ Nên cấu hình biến môi trường RIOHUB_API_KEY trên server (Vercel/hosting).
 * Có giá trị fallback cứng giống bot để tránh vỡ luồng khi thiếu biến môi
 * trường, nhưng biến môi trường (nếu có) luôn được ưu tiên dùng trước.
 */

const RIOHUB_API_KEY =
  process.env.RIOHUB_API_KEY || "rhk_5a1088ab296e9d65199d0de2add0bd3667a47b6b1d8ab511";
const RIOHUB_BASE_URL = "https://riohub.vn/api/v1";
const RIOHUB_CREATOR_USERNAME = "meozzsansale";

// Nhận tất cả subdomain của tiktok.com (www, vt, vm, m, shop, vi, ...) và cả
// khi thiếu "https://" — giống TIKTOK_PATTERN trong bot_v48_spf.py.
const TIKTOK_HOST_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*tiktok\.com(?:\/[^\s"'<>)]*)?/i;

export function isTiktokLink(text) {
  return TIKTOK_HOST_RE.test(text || "");
}

export function extractTiktokLink(text) {
  const m = TIKTOK_HOST_RE.exec(text || "");
  return m ? m[0] : null;
}

// RioHub yêu cầu sub_id bắt buộc, 1–128 ký tự [A-Za-z0-9_-].
function cleanSubId(raw) {
  const cleaned = String(raw || "").replace(/[^A-Za-z0-9_-]/g, "");
  return (cleaned || `na${Date.now()}`).slice(0, 128);
}

function toFloat(v) {
  const n = parseFloat(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function avgRange(rawVal) {
  if (rawVal === null || rawVal === undefined || rawVal === "") return null;
  const vals = String(rawVal)
    .split("-")
    .map((p) => toFloat(p.trim()))
    .filter((v) => v !== null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function formatVnd(amount) {
  if (amount === null || amount === undefined) return "—";
  return Math.round(amount).toLocaleString("vi-VN") + "đ";
}

/**
 * Dò tìm URL ảnh sản phẩm trong object "product" mà RioHub trả về — vì
 * RioHub không có docs public công khai tên field ảnh chính xác, hàm này
 * quét ĐỆ QUY toàn bộ object/array tìm bất kỳ key nào có chứa "image",
 * "cover", "thumb" hoặc "picture" (không phân biệt hoa/thường) mà giá trị
 * là 1 chuỗi URL http(s), hoặc mảng URL. Cách này linh hoạt hơn hard-code
 * 1-2 tên field cụ thể, tránh bị lỡ khi RioHub đặt tên field khác dự đoán.
 */
function findImageUrl(node, depth = 0) {
  if (!node || depth > 4) return null;

  if (typeof node === "string") {
    return /^https?:\/\//i.test(node) ? node : null;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findImageUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node === "object") {
    const IMAGE_KEY_RE = /image|cover|thumb|picture|avatar/i;
    // Ưu tiên các key trông giống ảnh trước, để không lỡ nhặt nhầm URL khác
    // (vd product_url) khi object có nhiều field chuỗi URL.
    const keys = Object.keys(node);
    const priorityKeys = keys.filter((k) => IMAGE_KEY_RE.test(k));
    for (const k of priorityKeys) {
      const found = findImageUrl(node[k], depth + 1);
      if (found) return found;
    }
    for (const k of keys) {
      if (priorityKeys.includes(k)) continue;
      if (typeof node[k] === "object") {
        const found = findImageUrl(node[k], depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  return null;
}

/**
 * Quy đổi object "product" RioHub trả về → {productName, commissionStr,
 * commissionPct, image} — [v41] hoa hồng hiển thị lúc chuyển link lấy
 * NGUYÊN theo dữ liệu RioHub/TikTok trả về, KHÔNG nhân thêm hệ số quy đổi
 * (hệ số quy đổi × (1-11%) × 80% chỉ áp dụng khi tính ví tiền / rút tiền).
 */
function parseRiohubCommission(product) {
  if (!product || !String(product.title || "").trim()) {
    return { productName: "", commissionStr: "—", commissionPct: "—", image: null };
  }

  const comm = product.commission || {};
  const rate = typeof comm.rate === "number" ? comm.rate : null; // ÷100 = % gốc
  const commAmountRaw = avgRange(comm.amount);
  const rawPct = rate !== null ? rate / 100 : null;

  return {
    productName: String(product.title).trim(),
    commissionStr: commAmountRaw !== null ? formatVnd(commAmountRaw) : "—",
    commissionPct: rawPct !== null ? `${rawPct.toFixed(2)}%` : "—",
    image: findImageUrl(product),
  };
}

async function riohubPost(payload) {
  const res = await fetch(`${RIOHUB_BASE_URL}/partner/tiktok/affiliate/product-links`, {
    method: "POST",
    headers: {
      "X-Riohub-Api-Key": RIOHUB_API_KEY,
      "Content-Type": "application/json",
      "User-Agent": "MeozzHoanTien/1.0",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, data };
}

/**
 * Chuyển 1 link TikTok Shop → affiliate link + thông tin sản phẩm/hoa hồng
 * qua RioHub. Retry tối đa 3 lần khi gặp 429 (tôn trọng Retry-After).
 */
export async function convertTiktokLink(rawUrl, myId) {
  if (!RIOHUB_API_KEY) {
    throw new Error("Chưa cấu hình RIOHUB_API_KEY — không thể chuyển link TikTok.");
  }

  const payload = {
    creator_username: RIOHUB_CREATOR_USERNAME,
    product_url: rawUrl,
    sub_id: cleanSubId(myId),
  };

  const maxAttempts = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { status, headers, data } = await riohubPost(payload);

      if (status === 429) {
        const retryAfter = Math.min(parseFloat(headers.get("Retry-After") || "2") || 2, 5);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (status !== 200) {
        const errCode = data.error || data.code || data.message || JSON.stringify(data);
        throw new Error(`RioHub lỗi ${status}: ${errCode}`);
      }

      const affLink = data.affiliate_link;
      if (!affLink) {
        throw new Error("RioHub không trả về affiliate_link.");
      }

      const info = parseRiohubCommission(data.product || null);
      if (data.product && !info.image) {
        console.warn(
          "[tiktok] Không tìm thấy field ảnh trong product RioHub trả về. Keys:",
          Object.keys(data.product)
        );
      }

      return {
        convertedUrl: affLink,
        productName: info.productName,
        commissionStr: info.commissionStr,
        commissionPct: info.commissionPct,
        image: info.image,
      };
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
    }
  }

  throw new Error(
    `Không thể chuyển link TikTok sau ${maxAttempts} lần thử: ${lastErr?.message || lastErr}`
  );
}
