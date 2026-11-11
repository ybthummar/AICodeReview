"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getRepositoryReviewConfig, saveRepositoryReviewConfig } from "@/module/review-rules/actions";
import {
  DEFAULT_REVIEW_CONFIG,
  STRICTNESS_DESCRIPTIONS,
  STRICTNESS_LEVELS,
  type ReviewConfig,
} from "@/module/review-rules/lib/config";
import { CATEGORIES, CATEGORY_LABELS, SEVERITIES, SEVERITY_LABELS, type FindingCategory } from "@/module/review/lib/insights";
import {
  MAX_CUSTOM_RULES,
  RULE_PACK_IDS,
  RULE_PACKS,
  validateCustomRule,
  type CustomRule,
  type RulePackId,
} from "@/module/review-rules/lib/rules";

const FIELD_CLASS =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function CustomRuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: CustomRule;
  onChange: (patch: Partial<CustomRule>) => void;
  onRemove: () => void;
}) {
  const [extensionText, setExtensionText] = useState(rule.extensions.join(", "));
  const hasPattern = rule.pattern.trim().length > 0;
  const patternInvalid = hasPattern && validateCustomRule({ ...rule, name: rule.name || "rule" }) === null;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-center gap-2">
        <input
          value={rule.name}
          onChange={(e) => onChange({ name: e.target.value.slice(0, 60) })}
          placeholder="Rule name, e.g. No direct database calls in components"
          className={FIELD_CLASS}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          title="Remove rule"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <input
        value={rule.pattern}
        onChange={(e) => onChange({ pattern: e.target.value.slice(0, 200) })}
        placeholder="Regular expression matched against each added line"
        spellCheck={false}
        className={`${FIELD_CLASS} font-mono text-xs ${patternInvalid ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500" : ""}`}
      />
      {patternInvalid && (
        <p className="text-[11px] text-rose-600">
          This pattern is not a valid regular expression or may be too slow to run safely.
        </p>
      )}

      <input
        value={rule.message}
        onChange={(e) => onChange({ message: e.target.value.slice(0, 200) })}
        placeholder="Message shown on the finding"
        className={FIELD_CLASS}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <select
          value={rule.severity}
          onChange={(e) => onChange({ severity: e.target.value as CustomRule["severity"] })}
          className={FIELD_CLASS}
          aria-label="Severity"
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={rule.category}
          onChange={(e) => onChange({ category: e.target.value as FindingCategory })}
          className={FIELD_CLASS}
          aria-label="Category"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          value={extensionText}
          onChange={(e) => setExtensionText(e.target.value)}
          onBlur={() =>
            onChange({
              extensions: extensionText
                .split(/[\s,]+/)
                .map((ext) => ext.trim().toLowerCase().replace(/^\./, ""))
                .filter(Boolean),
            })
          }
          placeholder="Extensions: ts, tsx (all if empty)"
          className={FIELD_CLASS}
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={rule.ignoreCase}
          onChange={(e) => onChange({ ignoreCase: e.target.checked })}
          className="h-3.5 w-3.5 accent-blue-600"
        />
        Ignore case
      </label>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-blue-600"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

export default function RulesDialog({
  repositoryId,
  repositoryName,
}: {
  repositoryId: string;
  repositoryName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ReviewConfig>(DEFAULT_REVIEW_CONFIG);
  const [ignoredText, setIgnoredText] = useState(DEFAULT_REVIEW_CONFIG.ignoredPaths.join("\n"));

  const loadConfig = async () => {
    setLoading(true);
    try {
      const result = await getRepositoryReviewConfig(repositoryId);
      if (result.ok) {
        setConfig(result.data);
        setIgnoredText(result.data.ignoredPaths.join("\n"));
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Could not load review rules.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void loadConfig();
  };

  const toggleFocus = (area: FindingCategory) => {
    setConfig((prev) => ({
      ...prev,
      focusAreas: prev.focusAreas.includes(area)
        ? prev.focusAreas.filter((a) => a !== area)
        : [...prev.focusAreas, area],
    }));
  };

  const toggleRulePack = (pack: RulePackId) => {
    setConfig((prev) => ({
      ...prev,
      rulePacks: prev.rulePacks.includes(pack)
        ? prev.rulePacks.filter((p) => p !== pack)
        : [...prev.rulePacks, pack],
    }));
  };

  const addCustomRule = () => {
    setConfig((prev) => {
      if (prev.customRules.length >= MAX_CUSTOM_RULES) return prev;
      return {
        ...prev,
        customRules: [
          ...prev.customRules,
          {
            id: `custom-${Date.now().toString(36)}`,
            name: "",
            pattern: "",
            ignoreCase: false,
            severity: "medium",
            category: "maintainability",
            message: "",
            extensions: [],
          },
        ],
      };
    });
  };

  const updateCustomRule = (id: string, patch: Partial<CustomRule>) => {
    setConfig((prev) => ({
      ...prev,
      customRules: prev.customRules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }));
  };

  const removeCustomRule = (id: string) => {
    setConfig((prev) => ({ ...prev, customRules: prev.customRules.filter((rule) => rule.id !== id) }));
  };

  const handleSave = async () => {
    const incomplete = config.customRules.find(
      (rule) => validateCustomRule(rule) === null
    );
    if (incomplete) {
      toast.error(
        incomplete.name.trim()
          ? `Fix the pattern of the rule "${incomplete.name}" or remove it.`
          : "Give every custom rule a name and a valid pattern, or remove it."
      );
      return;
    }

    setSaving(true);
    try {
      const result = await saveRepositoryReviewConfig(repositoryId, {
        ...config,
        ignoredPaths: ignoredText.split("\n").map((line) => line.trim()).filter(Boolean),
      });

      if (result.ok) {
        toast.success("Review rules saved");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Could not save review rules.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="p-1 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
          title="Review rules"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Review rules</DialogTitle>
          <DialogDescription>
            Control how RepoPilot reviews pull requests in <strong>{repositoryName}</strong>.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Loading rules...
          </div>
        ) : (
          <div className="space-y-5 py-1">
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Strictness</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {STRICTNESS_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, strictness: level }))}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      config.strictness === level
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block text-sm font-semibold capitalize text-slate-900">{level}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                      {STRICTNESS_DESCRIPTIONS[level]}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Focus areas <span className="font-normal normal-case text-slate-400">(optional)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => toggleFocus(area)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      config.focusAreas.includes(area)
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {CATEGORY_LABELS[area]}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Ignored paths <span className="font-normal normal-case text-slate-400">(one glob per line)</span>
              </label>
              <textarea
                value={ignoredText}
                onChange={(e) => setIgnoredText(e.target.value)}
                rows={5}
                spellCheck={false}
                className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-[11px] text-slate-500">
                Matching files are removed from the diff before review. Supports <code>*</code>, <code>**</code> and <code>?</code>.
              </p>
            </section>

            <section className="space-y-2">
              <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-600">
                Custom instructions
                <span className="font-normal normal-case text-slate-400">{config.customInstructions.length}/1000</span>
              </label>
              <textarea
                value={config.customInstructions}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, customInstructions: e.target.value.slice(0, 1000) }))
                }
                rows={4}
                placeholder="For example: we use Zod for validation, prefer async/await, never log user emails."
                className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Rule packs</p>
              <div className="grid gap-2">
                {RULE_PACK_IDS.map((pack) => (
                  <Toggle
                    key={pack}
                    checked={config.rulePacks.includes(pack)}
                    onChange={() => toggleRulePack(pack)}
                    label={RULE_PACKS[pack].label}
                    hint={RULE_PACKS[pack].description}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Custom rules{" "}
                  <span className="font-normal normal-case text-slate-400">
                    ({config.customRules.length}/{MAX_CUSTOM_RULES})
                  </span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomRule}
                  disabled={config.customRules.length >= MAX_CUSTOM_RULES}
                  className="h-7 gap-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add rule
                </Button>
              </div>
              {config.customRules.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Match your own patterns on added lines. Every hit becomes a finding with the message you choose.
                </p>
              ) : (
                <div className="space-y-2">
                  {config.customRules.map((rule) => (
                    <CustomRuleEditor
                      key={rule.id}
                      rule={rule}
                      onChange={(patch) => updateCustomRule(rule.id, patch)}
                      onRemove={() => removeCustomRule(rule.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-2">
              <Toggle
                checked={config.autoReview}
                onChange={(autoReview) => setConfig((prev) => ({ ...prev, autoReview }))}
                label="Review pull requests automatically"
                hint="When off, reviews only run when you start them from the dashboard."
              />
              <Toggle
                checked={config.inlineComments}
                onChange={(inlineComments) => setConfig((prev) => ({ ...prev, inlineComments }))}
                label="Post inline comments"
                hint="Leave line-level comments with one-click suggested changes on GitHub."
              />
              <Toggle
                checked={config.securityScan}
                onChange={(securityScan) => setConfig((prev) => ({ ...prev, securityScan }))}
                label="Scan for secrets and vulnerable dependencies"
                hint="Checks added lines for leaked keys and new packages against the OSV database."
              />
              <Toggle
                checked={config.walkthrough}
                onChange={(walkthrough) => setConfig((prev) => ({ ...prev, walkthrough }))}
                label="Add a walkthrough to every review"
                hint="Summarises each changed file and draws a Mermaid diagram of the change."
              />
            </section>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              "Save rules"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
