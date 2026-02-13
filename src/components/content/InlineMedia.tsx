import { useState } from 'react';
import { shortenUrl } from '@/lib/content/parse';

export function InlineImage({ url, isMine }: { url: string; isMine: boolean }) {
  const [error, setError] = useState(false);

  const linkClass = isMine
    ? 'text-gray-950/80 underline decoration-gray-950/40'
    : 'text-amber-400 underline decoration-amber-400/40';

  if (error) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {shortenUrl(url)}
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block my-1">
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setError(true)}
        className="max-w-full max-h-80 rounded-lg"
      />
    </a>
  );
}

export function InlineVideo({ url }: { url: string }) {
  return (
    <video
      src={url}
      controls
      preload="metadata"
      className="my-1 max-w-full max-h-80 rounded-lg"
    />
  );
}

export function YouTubeThumbnail({ videoId, url }: { videoId: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="relative block my-1 group">
      <img
        src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
        alt="YouTube video"
        loading="lazy"
        className="max-w-full max-h-80 rounded-lg"
      />
      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 group-hover:bg-red-600/90 transition-colors">
          <svg className="h-6 w-6 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </a>
  );
}
