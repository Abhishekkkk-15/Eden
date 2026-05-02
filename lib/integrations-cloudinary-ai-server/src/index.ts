import { v2 as cloudinary } from "cloudinary";

let configured = false;

function configureCloudinary() {
  if (configured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary configuration missing in environment variables.");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  configured = true;
}

export async function uploadToCloudinary(opts: {
  buffer: Buffer;
  folder?: string;
  publicId?: string;
  resourceType?: "image" | "video" | "raw" | "auto";
}): Promise<{ url: string; publicId: string }> {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder || "eden",
        public_id: opts.publicId,
        resource_type: opts.resourceType || "auto",
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Upload failed: No result returned."));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    (uploadStream as any).end(opts.buffer);
  });
}

export async function deleteFromCloudinary(publicId: string, resourceType: "image" | "video" | "raw" = "image") {
  configureCloudinary();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
