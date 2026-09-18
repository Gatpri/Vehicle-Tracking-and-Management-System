import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import "./PasswordInput.css";

/**
 * A password input that carries its own show/hide toggle.
 *
 * Every place in the app that takes a password uses this, so the reveal
 * control behaves and looks the same whether a customer is signing in or an
 * admin is creating a staff account. The eye is an inline SVG rather than an
 * emoji — emoji render differently per platform and looked out of place.
 */
function PasswordInput({
  id,
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  // Uncontrolled callers (none today, but the component allows it) still need
  // the toggle to appear, so track what was typed rather than reading `value`.
  const [typed, setTyped] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  // An empty field has nothing to reveal, so the eye would just be clutter —
  // it fades in on the first character and away again if the field is cleared.
  const hasValue = value !== undefined && value !== null ? String(value).length > 0 : typed;

  return (
    <div className="pw-input">
      <input
        {...props}
        id={inputId}
        value={value}
        onChange={(e) => {
          setTyped(e.target.value.length > 0);
          onChange?.(e);
        }}
        type={visible ? "text" : "password"}
        className="pw-input-field"
      />
      <button
        type="button"
        className={`pw-input-toggle ${hasValue ? "is-visible" : ""}`}
        // Hidden from the tab order and from assistive tech while there is
        // nothing to reveal.
        aria-hidden={!hasValue}
        // The field itself has no visible state change beyond the dots, so the
        // control has to announce which way it will flip.
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        // Keeps the toggle out of the tab order between the field and the
        // submit button, and stops it stealing focus on click.
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        d="M10.6 6.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a18.4 18.4 0 0 1-3.2 4.2M6.2 6.8A18.3 18.3 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.2-.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m3 3 18 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default PasswordInput;
