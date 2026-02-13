import { useProfile } from '@/hooks/use-profile';

export function ProfilePic({
  pubkey,
  size = 'md',
  onClick,
}: {
  pubkey: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}) {
  const { data: profile } = useProfile(pubkey);

  const dims: Record<string, string> = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-14 w-14',
  };
  const texts: Record<string, string> = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg',
  };

  const dim = dims[size];
  const text = texts[size];
  const clickable = onClick ? 'cursor-pointer' : '';

  if (profile?.picture) {
    return (
      <img
        src={profile.picture}
        alt=""
        onClick={onClick}
        className={`${dim} rounded-full object-cover ring-1 ring-gray-800 ${clickable}`}
      />
    );
  }

  const hue = parseInt(pubkey.slice(0, 6), 16) % 360;
  return (
    <div
      onClick={onClick}
      className={`${dim} flex items-center justify-center rounded-full ${text} font-medium text-white/80 ${clickable}`}
      style={{ backgroundColor: `hsl(${hue}, 40%, 25%)` }}
    >
      {pubkey.slice(0, 2).toUpperCase()}
    </div>
  );
}
