import { PhotoFolder } from "./PhotoFolder";

// Japan flag stamp icon
const JapanStamp = () => (
  <div className="w-10 h-10 rounded-lg border-2 border-red-400 bg-white flex items-center justify-center shadow-sm">
    <div className="w-5 h-5 rounded-full bg-red-500" />
  </div>
);

// Torii gate icon
const ToriiGate = () => (
  <svg
    viewBox="0 0 64 64"
    className="w-full h-full"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Top bar */}
    <rect x="4" y="8" width="56" height="8" rx="2" fill="#DC2626" />
    {/* Middle bar */}
    <rect x="8" y="20" width="48" height="6" rx="2" fill="#DC2626" />
    {/* Left pillar */}
    <rect x="12" y="20" width="6" height="40" rx="1" fill="#DC2626" />
    {/* Right pillar */}
    <rect x="46" y="20" width="6" height="40" rx="1" fill="#DC2626" />
    {/* Base left */}
    <rect x="8" y="56" width="14" height="4" rx="1" fill="#B91C1C" />
    {/* Base right */}
    <rect x="42" y="56" width="14" height="4" rx="1" fill="#B91C1C" />
  </svg>
);

// Sample images (using placeholders - replace with actual images)
const sampleImages = [
  "https://images.unsplash.com/photo-1522383225653-ed111181a951?w=400&h=300&fit=crop", // cherry blossom
  "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=400&h=300&fit=crop", // temple
  "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=400&h=300&fit=crop", // mt fuji
  "https://images.unsplash.com/photo-1580822185323-186c34e71510?w=400&h=300&fit=crop", // sushi
];

export function PhotoFolderDemo() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <PhotoFolder
        items={sampleImages.map((img, i) => ({
          id: i,
          title: `Image ${i+1}`,
          kind: "image",
          thumbnailUrl: img
        }))}
        title="Japan Trip"
        emoji="🇯🇵"
        onClick={() => console.log("Folder clicked!")}
      />
    </div>
  );
}

export { JapanStamp, ToriiGate };
