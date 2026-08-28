import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { UPLOAD_LIMITS } from "@/config/constants";
import { getGeminiModel, isGeminiConfigured } from "@/lib/ai/gemini";
import { formatVin, isValidVin } from "@/lib/utils/vin";
import { decodeVinDetails } from "@/lib/vehicles/vin-decoder";

const responseSchema = z.object({ vin: z.string() });

function parseModelJson(text: string) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return responseSchema.parse(JSON.parse(normalized));
}

export async function POST(request: Request) {
  const auth = await requireApiRole([
    "consumer",
    "technician",
    "org_manager",
    "admin",
  ]);
  if ("response" in auth) return auth.response;

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "VIN photo scanning is not configured" },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a VIN photo" }, { status: 400 });
  }

  const allowedTypes = UPLOAD_LIMITS.allowedImageTypes as readonly string[];
  if (!allowedTypes.includes(file.type) || file.size > UPLOAD_LIMITS.maxImageSize) {
    return NextResponse.json(
      { error: "Use a supported image smaller than 10MB" },
      { status: 400 }
    );
  }

  try {
    const imageBytes = Buffer.from(await file.arrayBuffer());
    const model = getGeminiModel();
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Read the vehicle identification number visible in this image. " +
                "A VIN is exactly 17 characters and never contains I, O, or Q. " +
                "Return JSON only in the shape {\"vin\":\"...\"}. If no complete VIN is visible, return {\"vin\":\"\"}.",
            },
            {
              inlineData: {
                mimeType: file.type,
                data: imageBytes.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    });

    const extracted = formatVin(parseModelJson(result.response.text()).vin);
    if (!isValidVin(extracted)) {
      return NextResponse.json(
        { error: "A valid 17-character VIN was not found. Retake the photo closer and in better light." },
        { status: 422 }
      );
    }

    const decoded = await decodeVinDetails(extracted);
    return NextResponse.json({
      data: decoded ?? {
        vin: extracted,
        year: null,
        make: null,
        model: null,
        trim: null,
      },
    });
  } catch (error) {
    console.error("[vin-scan] Failed to read VIN photo", error);
    return NextResponse.json(
      { error: "Could not read that VIN photo. Please try again." },
      { status: 502 }
    );
  }
}
