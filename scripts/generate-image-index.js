import { readdir, writeFile } from "fs/promises";
import { join } from "path";

const PICTURES_BASE = "public/pictures";
const OUTPUT_FILE = "public/image-index.json";

async function collectImages(dir, basePath = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const images = [];

  for (const entry of entries) {
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      images.push(...(await collectImages(join(dir, entry.name), relPath)));
    } else if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(entry.name)) {
      images.push(relPath);
    }
  }

  return images;
}

async function main() {
  const baseDir = join(process.cwd(), PICTURES_BASE);
  const langDirs = await readdir(baseDir, { withFileTypes: true });

  const index = {};
  let totalImages = 0;

  for (const langEntry of langDirs) {
    if (!langEntry.isDirectory()) continue;
    const lang = langEntry.name;
    const langPath = join(baseDir, lang);

    // Find book folders inside each language
    const bookDirs = await readdir(langPath, { withFileTypes: true });
    for (const bookEntry of bookDirs) {
      if (!bookEntry.isDirectory()) continue;
      const bookFolder = bookEntry.name;
      const bookPath = join(langPath, bookFolder);

      const allImages = await collectImages(bookPath);

      // Group by top-level directory (chapter number)
      const grouped = {};
      for (const img of allImages) {
        const chapter = img.split("/")[0];
        if (!grouped[chapter]) grouped[chapter] = [];
        grouped[chapter].push(img);
      }

      const key = `${lang}/${bookFolder}`;
      index[key] = grouped;
      totalImages += allImages.length;
    }
  }

  await writeFile(
    join(process.cwd(), OUTPUT_FILE),
    JSON.stringify(index, null, 2) + "\n"
  );

  console.log(
    `Generated ${OUTPUT_FILE} with ${totalImages} images across ${Object.keys(index).length} book(s)`
  );
}

main().catch(console.error);
