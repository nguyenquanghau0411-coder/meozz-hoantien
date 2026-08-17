import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { isValidMyId } from "@/lib/shopee";

function respondWithSession(user) {
  return { myId: user.my_id, displayName: user.display_name };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const nickname = (body.nickname || "").trim();
    const myId = (body.myId || "").trim();

    // My ID (dãy số bot cấp) giờ là BẮT BUỘC cho mọi lượt đăng nhập — không
    // còn cho phép đăng nhập chỉ bằng tên gợi nhớ, để tránh nhầm lẫn giữa các
    // khách trùng tên.
    if (!myId) {
      return NextResponse.json(
        { error: "Vui lòng nhập My ID (dãy số bot cấp) để đăng nhập." },
        { status: 400 }
      );
    }

    if (!isValidMyId(myId)) {
      return NextResponse.json(
        { error: "My ID không hợp lệ. My ID chỉ gồm các chữ số do bot cấp." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Dùng upsert (INSERT ... ON CONFLICT) để gộp "tìm + tạo" thành MỘT
    // round-trip duy nhất tới Supabase.
    //
    // LƯU Ý: Tên gợi nhớ (nickname) KHÔNG còn được ghi vào cột display_name
    // dùng chung ở đây nữa — nếu 2 khách cùng dùng chung 1 My ID trên 2 điện
    // thoại khác nhau, việc ghi đè display_name dùng chung sẽ khiến tên gợi
    // nhớ của người này "đè" lên tên của người kia. Tên gợi nhớ giờ chỉ được
    // lưu ở phía trình duyệt (localStorage), riêng theo từng máy — xem
    // app/login/page.js và app/dashboard/DashboardClient.js.
    const { data: upserted, error: upsertError } = await supabase
      .from("users")
      .upsert(
        {
          my_id: myId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "my_id" }
      )
      .select("my_id, display_name")
      .single();

    if (upsertError) throw upsertError;

    // display_name (server) chỉ còn dùng làm giá trị dự phòng khi máy khách
    // chưa có tên gợi nhớ riêng nào lưu ở localStorage.
    const user = {
      my_id: upserted.my_id,
      display_name: upserted.display_name || nickname || "Anh / Chị",
    };

    const token = await createSessionToken({
      myId: user.my_id,
      displayName: user.display_name,
    });

    // Trước đây dùng `process.env.NODE_ENV === "production"` để quyết định cờ
    // `secure` của cookie. Vấn đề: cờ này LUÔN là true trên môi trường
    // production dù request thực tế có tới qua HTTPS hay không (vd: sau một
    // proxy/CDN không forward đúng, hoặc trường hợp hiếm gặp domain phụ chưa
    // có SSL) — khi đó trình duyệt sẽ ÂM THẦM từ chối lưu cookie "secure" vì
    // request không phải HTTPS thật, khiến người dùng đăng nhập "thành công"
    // (API trả 200) nhưng sang trang /dashboard lại bị đá về /login vì không
    // còn cookie phiên. Đây là nguyên nhân chính khiến "bấm Đăng nhập cứ load
    // lại trang" với một số người dùng.
    //
    // Sửa: dựa trên PROTOCOL THẬT của request (ưu tiên header
    // x-forwarded-proto do Vercel/most proxy set đúng), chỉ bật `secure`
    // khi request thực sự qua HTTPS — luôn hoạt động đúng dù deploy ở đâu.
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isHttps = forwardedProto
      ? forwardedProto.split(",")[0].trim() === "https"
      : request.nextUrl.protocol === "https:";

    const response = NextResponse.json(respondWithSession(user));
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Có lỗi xảy ra khi đăng nhập. Vui lòng thử lại." },
      { status: 500 }
    );
  }
}
