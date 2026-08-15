import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { convertShopeeLink, isSpfLink, convertSpfLink } from "@/lib/shopee";
import { isTiktokLink, convertTiktokLink } from "@/lib/tiktok";

export async function POST(request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const url = (body.shopeeUrl || "").trim();
    if (!url) {
      return NextResponse.json({ error: "Vui lòng nhập link." }, { status: 400 });
    }

    // [Đồng bộ bot_v48_spf] Thứ tự kiểm tra: ShopeeFood/SPF trước (vì domain
    // shopee.vn/shopeefood.shopee.vn dễ dính nhầm nhánh Shopee thường), rồi
    // TikTok Shop, còn lại mặc định là link Shopee thường.
    let result;
    if (isSpfLink(url)) {
      result = await convertSpfLink(url, currentUser.myId);
    } else if (isTiktokLink(url)) {
      result = await convertTiktokLink(url, currentUser.myId);
    } else {
      result = await convertShopeeLink(url, currentUser.myId);
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Không thể chuyển link này." },
      { status: 400 }
    );
  }
}
