import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useProfile } from '@/hooks/use-profile';
import { usePublishProfile } from '@/hooks/use-publish-profile';

interface Props {
  onClose: () => void;
}

export function EditProfileDialog({ onClose }: Props) {
  const { pubkey } = useAuth();
  const { data: profile } = useProfile(pubkey ?? '');
  const { mutateAsync, isPending } = usePublishProfile();

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [name, setName] = useState(profile?.name ?? '');
  const [about, setAbout] = useState(profile?.about ?? '');
  const [picture, setPicture] = useState(profile?.picture ?? '');
  const [banner, setBanner] = useState(profile?.banner ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [nip05, setNip05] = useState(profile?.nip05 ?? '');
  const [picError, setPicError] = useState(false);

  async function handleSave() {
    await mutateAsync({ displayName, name, about, picture, banner, website, nip05 });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      data-testid="edit-profile-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="mx-4 w-full max-w-md rounded-2xl border border-gray-800/60 bg-gray-900 p-6 shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        <h2 className="font-display text-lg font-semibold text-gray-100">Edit profile</h2>
        <p className="mt-1 text-xs text-gray-500">
          Update your Nostr profile metadata
        </p>

        <div className="mt-5 space-y-4">
          {/* Picture preview */}
          {picture && !picError && (
            <div className="flex justify-center">
              <img
                src={picture}
                alt="Profile"
                data-testid="picture-preview"
                className="h-16 w-16 rounded-full object-cover border border-gray-700/50"
                onError={() => setPicError(true)}
              />
            </div>
          )}

          <Field label="Display Name" value={displayName} onChange={setDisplayName} />
          <Field label="Username" value={name} onChange={setName} placeholder="alice" />
          <Field label="About" value={about} onChange={setAbout} multiline />
          <Field
            label="Picture URL"
            value={picture}
            onChange={(v) => { setPicture(v); setPicError(false); }}
            placeholder="https://..."
          />
          <Field label="Banner URL" value={banner} onChange={setBanner} placeholder="https://..." />
          <Field label="Website" value={website} onChange={setWebsite} placeholder="https://..." />
          <Field label="NIP-05" value={nip05} onChange={setNip05} placeholder="user@domain.com" />
        </div>

        <div className="mt-6 flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost text-xs">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="btn-primary text-xs"
            data-testid="save-profile-button"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  const className = "w-full rounded-lg border border-gray-700/60 bg-gray-900/80 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none transition-all duration-200 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20";

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-400 mb-1">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${className} resize-none`}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
        />
      )}
    </div>
  );
}
