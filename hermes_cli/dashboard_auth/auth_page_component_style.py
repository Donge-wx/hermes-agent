"""Component and state styling for public dashboard auth pages."""

from typing import Final


AUTH_PAGE_COMPONENT_STYLE: Final = r"""
.provider-list,
.provider-form {
  display: grid;
  gap: 14px;
}

.provider-form + .provider-form,
.provider-btn + .provider-form,
.provider-form + .provider-btn { margin-top: 4px; }

.form-title {
  color: var(--mk-secondary);
  font-size: 14px;
  font-weight: 600;
}

.field {
  display: grid;
  gap: 7px;
}

.field-label {
  color: var(--mk-secondary);
  font-size: 14px;
  font-weight: 550;
}

.field-input {
  width: 100%;
  min-height: 48px;
  padding: 0 15px;
  border: 1px solid var(--mk-stroke-strong);
  border-radius: var(--mk-radius-control);
  outline: none;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 1px 2px rgba(47, 67, 106, 0.05), 0 1px 0 rgba(255, 255, 255, 0.8);
  color: var(--mk-ink);
  font: inherit;
  font-size: 16px;
  transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
}

.field-input:hover { border-color: rgba(65, 91, 145, 0.42); }

.field-input:focus-visible {
  border-color: var(--mk-blue);
  background: var(--mk-surface-strong);
  box-shadow: 0 0 0 4px var(--mk-focus), inset 0 1px 2px rgba(47, 67, 106, 0.04);
}

.provider-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 48px;
  padding: 0 20px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: var(--mk-radius-control);
  background: linear-gradient(145deg, #3970f2 0%, var(--mk-blue) 52%, var(--mk-blue-deep) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.36), 0 8px 20px rgba(36, 87, 230, 0.24);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.01em;
  text-align: center;
  text-decoration: none;
  transition: transform 110ms ease, box-shadow 110ms ease, filter 110ms ease;
}

.provider-btn:hover {
  filter: saturate(1.06) brightness(1.02);
  transform: translateY(-1px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42), 0 11px 24px rgba(36, 87, 230, 0.28);
}

.provider-btn:active { transform: translateY(0) scale(0.99); }
.provider-btn:focus-visible { outline: 3px solid var(--mk-focus); outline-offset: 3px; }

.provider-btn:disabled {
  cursor: progress;
  filter: grayscale(0.14);
  opacity: 0.64;
  transform: none;
}

.form-error {
  color: var(--mk-danger);
  font-size: 14px;
  line-height: 1.45;
}

.unavailable-copy {
  display: grid;
  gap: 14px;
  margin-top: 24px;
  color: var(--mk-secondary);
  font-size: 15px;
  line-height: 1.65;
}

.unavailable-copy p { margin: 0; }

code {
  padding: 2px 6px;
  border: 1px solid var(--mk-stroke);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--mk-blue-deep);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.88em;
}

.auth-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 20px;
  color: var(--mk-tertiary);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--mk-cyan), var(--mk-blue));
  box-shadow: 0 0 0 4px rgba(32, 174, 185, 0.1);
}

::selection { background: rgba(36, 87, 230, 0.18); color: var(--mk-ink); }
"""
