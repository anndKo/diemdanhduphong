/**
 * Upload a file to Supabase Storage with progress tracking via XMLHttpRequest.
 */
export const uploadFileWithProgress = async (
  bucket: string,
  path: string,
  file: File,
  supabaseUrl: string,
  _supabaseKey: string,
  onProgress: (percent: number) => void
): Promise<string> => {
  // Get the current session token for authenticated upload
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || _supabaseKey;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
        resolve(publicUrl);
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "true");
    xhr.send(file);
  });
};
