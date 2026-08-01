import { FormEvent, useEffect, useState } from "react";
import { Palette, X } from "lucide-react";

type Props = {
  open: boolean;
  color: string;
  onClose: () => void;
  onSave: (color: string) => void;
};

const presets = [
  { name: "차콜", color: "#343941" },
  { name: "슬레이트", color: "#29313d" },
  { name: "네이비", color: "#202a3a" },
  { name: "웜 그레이", color: "#3d3a38" },
  { name: "블랙", color: "#17191d" },
  { name: "라이트", color: "#dfe3e8" },
];

export function AppearanceModal({ open, color, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(color);
  useEffect(() => {
    if (open) setDraft(color);
  }, [color, open]);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(draft);
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal appearance-modal" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
        <header>
          <div className="settings-title">
            <span><Palette size={19} /></span>
            <div>
              <div className="eyebrow">APPEARANCE</div>
              <h2 id="appearance-title">전체 배경 설정</h2>
            </div>
          </div>
          <button className="icon-button" aria-label="배경 설정 닫기" onClick={onClose}><X size={17} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="color-presets">
            {presets.map((preset) => (
              <button
                type="button"
                key={preset.color}
                className={draft.toLowerCase() === preset.color ? "selected" : ""}
                onClick={() => setDraft(preset.color)}
              >
                <span style={{ backgroundColor: preset.color }} />
                {preset.name}
              </button>
            ))}
          </div>
          <label className="custom-color">
            <span>직접 선택</span>
            <div>
              <input type="color" value={draft} onChange={(event) => setDraft(event.target.value)} />
              <input
                aria-label="배경색 코드"
                value={draft}
                pattern="^#[0-9a-fA-F]{6}$"
                onChange={(event) => setDraft(event.target.value)}
              />
            </div>
          </label>
          <div className="background-preview" style={{ backgroundColor: draft }}>
            <span>앱 전체 배경 미리보기</span>
          </div>
          <footer>
            <button type="button" className="modal-cancel" onClick={onClose}>취소</button>
            <button type="submit" className="modal-save">적용</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
