"use client";

import { useState } from "react";
import { DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/types";

interface Props {
  open: boolean;
  thresholds: Thresholds;
  onChange: (t: Thresholds) => void;
  apiKey: string;
  onApiKeyChange: (k: string) => void;
  onClose: () => void;
}

export default function SettingsModal({
  open,
  thresholds,
  onChange,
  apiKey,
  onApiKeyChange,
  onClose,
}: Props) {
  const [showKey, setShowKey] = useState(false);

  function setVix(key: keyof Thresholds["vix"], val: number) {
    onChange({ ...thresholds, vix: { ...thresholds.vix, [key]: val } });
  }
  function setOas(key: keyof Thresholds["oas"], val: number) {
    onChange({ ...thresholds, oas: { ...thresholds.oas, [key]: val } });
  }
  function setFg(key: keyof Thresholds["fg"], val: number) {
    onChange({ ...thresholds, fg: { ...thresholds.fg, [key]: val } });
  }

  return (
    <div
      className={`modal-overlay ${open ? "on" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <div className="modal-eyebrow">Configuration</div>
            <h2>
              Seuils <em>de classification</em>
            </h2>
            <p>
              Ajustez les bornes utilisées pour classer chaque indicateur. La
              barre colorie les zones selon vos réglages — les changements sont
              appliqués immédiatement.
            </p>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            title="Fermer (Esc)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Anthropic API key */}
          <div className="thr-group">
            <div className="thr-head">
              <span className="thr-name">Clé API Anthropic</span>
              <span className="thr-src">stockée localement · navigateur</span>
            </div>
            <div className="thr-sub">
              Renseignez votre clé pour activer l&apos;analyse IA (verdict global
              et S&amp;P 500). Elle reste dans le <code>localStorage</code> de ce
              navigateur et n&apos;est transmise qu&apos;à l&apos;API de cette
              application pour appeler Claude côté serveur.{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="thr-link"
              >
                Obtenir une clé
              </a>
              .
            </div>

            <div className="thr-apikey">
              <div className="thr-apikey-row">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  placeholder="sk-ant-api03-…"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowKey((v) => !v)}
                  title={showKey ? "Masquer" : "Afficher"}
                >
                  {showKey ? "Masquer" : "Afficher"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => onApiKeyChange("")}
                  disabled={!apiKey}
                  title="Effacer la clé enregistrée"
                >
                  Effacer
                </button>
              </div>
              <div className="thr-apikey-hint">
                {apiKey
                  ? "Clé active — l'analyse IA utilise cette clé."
                  : "Aucune clé renseignée — l'analyse IA utilisera la variable ANTHROPIC_API_KEY du serveur si elle est définie."}
              </div>
            </div>
          </div>

          {/* VIX */}
          <div className="thr-group">
            <div className="thr-head">
              <span className="thr-name">VIX</span>
              <span className="thr-src">yfinance · ^VIX</span>
            </div>
            <div className="thr-sub">
              Volatilité implicite du S&amp;P 500 sur 30 jours. Plus haut = plus
              de peur.
            </div>

            <div className="thr-preview">
              <div className="thr-preview-bar">
                <div
                  className="thr-preview-seg s-euphorie"
                  style={{ flex: thresholds.vix.euphorie }}
                />
                <div
                  className="thr-preview-seg s-calme"
                  style={{ flex: thresholds.vix.calme - thresholds.vix.euphorie }}
                />
                <div
                  className="thr-preview-seg s-stress"
                  style={{ flex: thresholds.vix.stress - thresholds.vix.calme }}
                />
                <div
                  className="thr-preview-seg s-panique"
                  style={{ flex: Math.max(5, 50 - thresholds.vix.stress) }}
                />
              </div>
              <div className="thr-preview-labels">
                <div style={{ flex: thresholds.vix.euphorie }}>
                  0 – {thresholds.vix.euphorie}
                </div>
                <div
                  style={{ flex: thresholds.vix.calme - thresholds.vix.euphorie }}
                >
                  {thresholds.vix.euphorie} – {thresholds.vix.calme}
                </div>
                <div
                  style={{ flex: thresholds.vix.stress - thresholds.vix.calme }}
                >
                  {thresholds.vix.calme} – {thresholds.vix.stress}
                </div>
                <div style={{ flex: Math.max(5, 50 - thresholds.vix.stress) }}>
                  &gt; {thresholds.vix.stress}
                </div>
              </div>
            </div>

            <div className="thr-inputs">
              <div className="thr-field">
                <label>
                  <span className="op">&lt;</span>{" "}
                  <span className="w-euphorie">Euphorie</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={thresholds.vix.euphorie}
                    onChange={(e) =>
                      setVix("euphorie", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <div className="thr-field">
                <label>
                  <span className="op">≤</span>{" "}
                  <span className="w-calme">Calme</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={thresholds.vix.calme}
                    onChange={(e) =>
                      setVix("calme", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <div className="thr-field">
                <label>
                  <span className="op">≤</span>{" "}
                  <span className="w-stress">Stress</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={thresholds.vix.stress}
                    onChange={(e) =>
                      setVix("stress", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {/* HY OAS */}
          <div className="thr-group">
            <div className="thr-head">
              <span className="thr-name">HY OAS</span>
              <span className="thr-src">FRED · BAMLH0A0HYM2</span>
            </div>
            <div className="thr-sub">
              Spread des obligations high yield en points de pourcentage. Plus
              large = plus de stress crédit.
            </div>

            <div className="thr-preview">
              <div className="thr-preview-bar">
                <div
                  className="thr-preview-seg s-euphorie"
                  style={{ flex: thresholds.oas.euphorie }}
                />
                <div
                  className="thr-preview-seg s-calme"
                  style={{ flex: thresholds.oas.calme - thresholds.oas.euphorie }}
                />
                <div
                  className="thr-preview-seg s-stress"
                  style={{ flex: thresholds.oas.stress - thresholds.oas.calme }}
                />
                <div
                  className="thr-preview-seg s-panique"
                  style={{ flex: Math.max(1, 8 - thresholds.oas.stress) }}
                />
              </div>
              <div className="thr-preview-labels">
                <div style={{ flex: thresholds.oas.euphorie }}>
                  0 – {thresholds.oas.euphorie.toFixed(2)}
                </div>
                <div
                  style={{ flex: thresholds.oas.calme - thresholds.oas.euphorie }}
                >
                  {thresholds.oas.euphorie.toFixed(2)} –{" "}
                  {thresholds.oas.calme.toFixed(2)}
                </div>
                <div
                  style={{ flex: thresholds.oas.stress - thresholds.oas.calme }}
                >
                  {thresholds.oas.calme.toFixed(2)} –{" "}
                  {thresholds.oas.stress.toFixed(2)}
                </div>
                <div style={{ flex: Math.max(1, 8 - thresholds.oas.stress) }}>
                  &gt; {thresholds.oas.stress.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="thr-inputs">
              <div className="thr-field">
                <label>
                  <span className="op">&lt;</span>{" "}
                  <span className="w-euphorie">Euphorie</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={thresholds.oas.euphorie}
                    onChange={(e) =>
                      setOas("euphorie", parseFloat(e.target.value) || 0)
                    }
                  />
                  <span className="thr-unit">pp</span>
                </div>
              </div>
              <div className="thr-field">
                <label>
                  <span className="op">≤</span>{" "}
                  <span className="w-calme">Calme</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={thresholds.oas.calme}
                    onChange={(e) =>
                      setOas("calme", parseFloat(e.target.value) || 0)
                    }
                  />
                  <span className="thr-unit">pp</span>
                </div>
              </div>
              <div className="thr-field">
                <label>
                  <span className="op">≤</span>{" "}
                  <span className="w-stress">Stress</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={thresholds.oas.stress}
                    onChange={(e) =>
                      setOas("stress", parseFloat(e.target.value) || 0)
                    }
                  />
                  <span className="thr-unit">pp</span>
                </div>
              </div>
            </div>
          </div>

          {/* F&G */}
          <div className="thr-group">
            <div className="thr-head">
              <span className="thr-name">Fear &amp; Greed</span>
              <span className="thr-src">CNN · 0 → 100</span>
            </div>
            <div className="thr-sub">
              Indice composite CNN. Plus haut = plus gourmand. Inclut une zone
              neutre intermédiaire.
            </div>

            <div className="thr-preview">
              <div className="thr-preview-bar">
                <div
                  className="thr-preview-seg s-panique"
                  style={{ flex: thresholds.fg.panique }}
                />
                <div
                  className="thr-preview-seg s-stress"
                  style={{ flex: thresholds.fg.stress - thresholds.fg.panique }}
                />
                <div
                  className="thr-preview-seg s-neutre"
                  style={{ flex: thresholds.fg.neutre - thresholds.fg.stress }}
                />
                <div
                  className="thr-preview-seg s-calme"
                  style={{ flex: thresholds.fg.calme - thresholds.fg.neutre }}
                />
                <div
                  className="thr-preview-seg s-euphorie"
                  style={{ flex: 100 - thresholds.fg.calme }}
                />
              </div>
              <div className="thr-preview-labels">
                <div style={{ flex: thresholds.fg.panique }}>
                  0 – {thresholds.fg.panique - 1}
                </div>
                <div
                  style={{ flex: thresholds.fg.stress - thresholds.fg.panique }}
                >
                  {thresholds.fg.panique} – {thresholds.fg.stress - 1}
                </div>
                <div
                  style={{ flex: thresholds.fg.neutre - thresholds.fg.stress }}
                >
                  {thresholds.fg.stress} – {thresholds.fg.neutre - 1}
                </div>
                <div
                  style={{ flex: thresholds.fg.calme - thresholds.fg.neutre }}
                >
                  {thresholds.fg.neutre} – {thresholds.fg.calme - 1}
                </div>
                <div style={{ flex: 100 - thresholds.fg.calme }}>
                  {thresholds.fg.calme} – 100
                </div>
              </div>
            </div>

            <div className="thr-inputs fg">
              <div className="thr-field">
                <label>
                  <span className="op">&lt;</span>{" "}
                  <span className="w-panique">Panique</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={thresholds.fg.panique}
                    onChange={(e) =>
                      setFg("panique", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <div className="thr-field">
                <label>
                  <span className="op">&lt;</span>{" "}
                  <span className="w-stress">Stress</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={thresholds.fg.stress}
                    onChange={(e) =>
                      setFg("stress", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <div className="thr-field">
                <label>
                  <span className="op">&lt;</span>{" "}
                  <span className="w-neutre">Neutre</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={thresholds.fg.neutre}
                    onChange={(e) =>
                      setFg("neutre", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <div className="thr-field">
                <label>
                  <span className="op">&lt;</span>{" "}
                  <span className="w-calme">Calme</span>
                </label>
                <div className="thr-input-wrap">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={thresholds.fg.calme}
                    onChange={(e) =>
                      setFg("calme", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button
            className="btn-reset"
            onClick={() => onChange(DEFAULT_THRESHOLDS)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            Réinitialiser par défaut
          </button>
          <button className="btn-primary" onClick={onClose}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
