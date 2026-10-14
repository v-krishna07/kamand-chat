import React, { useState, useEffect } from 'react';
import { Lock, Globe, Copy, Check, QrCode } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore.js';
import { FluidSheet } from './FluidSheet.js';
import { generateQrMatrix } from '../lib/qr.js';

interface ProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileSheet: React.FC<ProfileSheetProps> = ({ isOpen, onClose }) => {
  const { user, qrPayload, updateProfile } = useAuthStore();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isRoomPrivate, setIsRoomPrivate] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.displayName);
      setBio(user.bio);
      setRoomCode(user.roomCode || '');
      setAvatarUrl(user.avatarUrl || '');
      setIsRoomPrivate(user.isRoomPrivate ?? true);
      setSaveMessage(null);
    }
  }, [user, isOpen]);

  if (!user) return null;

  const qrMatrix = generateQrMatrix(qrPayload || `kamand://contact/${user.id}:${user.username}`);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateProfile({
        displayName,
        bio,
        roomCode: roomCode.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        isRoomPrivate,
      });
      setSaveMessage('Profile saved');
    } finally {
      setIsSaving(false);
    }
  };

  const copyQrString = async () => {
    if (!qrPayload) return;
    await navigator.clipboard.writeText(qrPayload).catch(() => undefined);
    setCopiedQr(true);
    setTimeout(() => setCopiedQr(false), 2000);
  };

  return (
    <FluidSheet isOpen={isOpen} onClose={onClose} title="Profile & Privacy">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center gap-4 p-3 rounded-2xl bg-slate-900/80 border border-white/10">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-xl font-bold text-white flex-shrink-0 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white truncate">{user.displayName}</div>
            <div className="text-xs text-slate-400 truncate">
              @{user.username} · {user.email}
            </div>
            {user.roomCode && (
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 text-[11px]">
                <span>My room: {user.roomCode}</span>
                <span>({isRoomPrivate ? 'Contacts only' : 'Public'})</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-white/15 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              My Room (e.g. C-10, B-19)
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="C-10"
              className="w-full rounded-xl bg-slate-900 border border-white/15 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Bio</label>
          <input
            type="text"
            maxLength={160}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-xl bg-slate-900 border border-white/15 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
          />
        </div>

        {/* Room Privacy Toggle (Private by default per §4 & §13) */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/70 border border-white/10">
          <div className="flex items-center gap-2.5">
            {isRoomPrivate ? (
              <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <Globe className="w-4 h-4 text-amber-400 flex-shrink-0" />
            )}
            <div>
              <div className="text-xs font-semibold text-slate-100">
                Keep “My room” private to accepted contacts
              </div>
              <div className="text-[11px] text-slate-400">
                {isRoomPrivate
                  ? 'Only people you accept as contacts can see your hostel room.'
                  : 'Anyone on campus directory can see your room code.'}
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={isRoomPrivate}
            onChange={(e) => setIsRoomPrivate(e.target.checked)}
            aria-label="Keep My room private to accepted contacts"
            className="h-4 w-4 accent-sky-500 rounded"
          />
        </div>

        {/* Personal Contact QR Card */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 flex flex-col sm:flex-row items-center gap-4">
          <div
            className="p-2.5 rounded-xl bg-white flex-shrink-0"
            aria-label="Kamand Contact QR Code"
          >
            <svg width="84" height="84" viewBox={`0 0 ${qrMatrix.length} ${qrMatrix.length}`}>
              {qrMatrix.map((row, rIdx) =>
                row.map((cell, cIdx) =>
                  cell ? (
                    <rect
                      key={`${rIdx}-${cIdx}`}
                      x={cIdx}
                      y={rIdx}
                      width={1}
                      height={1}
                      fill="#0f172a"
                    />
                  ) : null
                )
              )}
            </svg>
          </div>
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-semibold text-sky-300">
              <QrCode className="w-3.5 h-3.5" />
              <span>Instant Contact QR Code</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 break-all">{qrPayload}</p>
            <button
              type="button"
              onClick={() => void copyQrString()}
              className="fluid-press mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-slate-200"
            >
              {copiedQr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedQr ? 'Copied QR Code' : 'Copy QR Code String'}</span>
            </button>
          </div>
        </div>

        {saveMessage && (
          <p className="text-xs text-emerald-400 text-center font-medium">{saveMessage}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="fluid-press min-h-[44px] px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold"
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </FluidSheet>
  );
};
