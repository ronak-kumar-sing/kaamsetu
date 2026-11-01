import { useState } from 'react';
import { View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Input,
  Money,
  SegmentedControl,
  Skeleton,
  Text,
} from '@/components/ui';
import { FadeContent } from '@/components/motion/FadeContent';
import { formatDate, todayInIndia } from '../format';

import { useSaveProjectDraft, usePublishProject, useSkills } from '../api';
import {
  DEFAULT_SETTINGS,
  EMPTY_BASICS,
  MAX_SKILLS,
  describeIssue,
  emptyMilestone,
  totalPaise,
  validateBuilder,
  amountToPaise,
  type BasicsDraft,
  type MilestoneDraft,
  type SettingsDraft,
} from '../builder';
import { PROJECT_CATEGORIES } from '../categories';
import { rpcErrorMessage } from '../errors';
import { Chip } from './Chip';
import { MilestoneBuilder } from './MilestoneBuilder';
import { SkillPicker } from './SkillPicker';

import type { ProjectVisibility } from '@/shared/schemas/projects';

export type BuilderStep = 'basics' | 'milestones' | 'rules' | 'review';
const STEPS: { value: BuilderStep; label: string }[] = [
  { value: 'basics', label: 'Basics' },
  { value: 'milestones', label: 'Plan' },
  { value: 'rules', label: 'Rules' },
  { value: 'review', label: 'Review' },
];

export interface BuilderInitial {
  /** Set when editing an existing draft. */
  projectId: string | null;
  basics: BasicsDraft;
  settings: SettingsDraft;
  milestones: MilestoneDraft[];
}

export interface ProjectBuilderProps {
  initial?: BuilderInitial;
  initialStep?: BuilderStep;
  onFinished: (projectId: string, published: boolean) => void;
}

const REVISION_OPTIONS = ['0', '1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }));
const CADENCE_OPTIONS = ['1', '2', '3', '5', '7', '14'].map((v) => ({ value: v, label: `${v}d` }));

export function ProjectBuilder({
  initial,
  initialStep = 'basics',
  onFinished,
}: ProjectBuilderProps) {
  const [step, setStep] = useState<BuilderStep>(initialStep);
  const [basics, setBasics] = useState<BasicsDraft>(initial?.basics ?? EMPTY_BASICS);
  const [settings, setSettings] = useState<SettingsDraft>(initial?.settings ?? DEFAULT_SETTINGS);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(
    () => initial?.milestones ?? [emptyMilestone(), emptyMilestone()],
  );
  const [savedId, setSavedId] = useState<string | null>(initial?.projectId ?? null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const skills = useSkills();
  const save = useSaveProjectDraft();
  const publish = usePublishProject();

  const today = todayInIndia();
  const validation = validateBuilder(basics, milestones, today);
  const stepIndex = STEPS.findIndex((s) => s.value === step);

  const goTo = (next: BuilderStep) => {
    setServerError(null);
    setStep(next);
  };

  const next = () => {
    setShowErrors(true);
    const target = STEPS[stepIndex + 1];
    if (target) goTo(target.value);
  };
  const back = () => {
    const target = STEPS[stepIndex - 1];
    if (target) goTo(target.value);
  };

  const run = async (kind: 'draft' | 'publish') => {
    if (busy) return;
    setShowErrors(true);
    setBusy(kind);
    setServerError(null);
    try {
      const id = await save.mutateAsync({ projectId: savedId, basics, settings, milestones });
      // Remember the id so a failed publish retries against the same draft instead of duplicating it.
      setSavedId(id);
      if (kind === 'publish') await publish.mutateAsync(id);
      onFinished(id, kind === 'publish');
    } catch (error) {
      setServerError(rpcErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-4">
      <SegmentedControl options={STEPS} value={step} onChange={goTo} />
      {serverError ? (
        <Banner
          tone="danger"
          title={busy === 'publish' ? "Couldn't publish" : "Couldn't save"}
          message={serverError}
        />
      ) : null}

      <FadeContent key={step} direction="none" duration={200}>
        {step === 'basics' ? (
          <BasicsStep
            basics={basics}
            onChange={setBasics}
            errors={showErrors ? validation.basics : {}}
            skills={skills}
          />
        ) : null}
        {step === 'milestones' ? (
          <MilestoneBuilder
            milestones={milestones}
            onChange={setMilestones}
            today={today}
            showErrors={showErrors}
          />
        ) : null}
        {step === 'rules' ? <RulesStep settings={settings} onChange={setSettings} /> : null}
        {step === 'review' ? (
          <ReviewStep
            basics={basics}
            milestones={milestones}
            validation={validation}
            onEdit={goTo}
          />
        ) : null}
      </FadeContent>

      {step === 'review' ? (
        <View className="gap-3">
          <Button
            title="Publish"
            loading={busy === 'publish'}
            disabled={!validation.publishable || busy !== null}
            onPress={() => void run('publish')}
            accessibilityHint="Posts the project so freelancers can send proposals"
          />
          <Button
            title="Save draft"
            variant="outline"
            loading={busy === 'draft'}
            disabled={!validation.savable || busy !== null}
            onPress={() => void run('draft')}
            accessibilityHint="Saves without publishing"
          />
          <Button title="Back" variant="ghost" onPress={back} />
        </View>
      ) : (
        <View className="flex-row gap-3">
          {stepIndex > 0 ? (
            <View className="flex-1">
              <Button title="Back" variant="outline" onPress={back} fullWidth />
            </View>
          ) : null}
          <View className="flex-1">
            <Button title="Next" onPress={next} fullWidth />
          </View>
        </View>
      )}
    </View>
  );
}

function BasicsStep({
  basics,
  onChange,
  errors,
  skills,
}: {
  basics: BasicsDraft;
  onChange: (next: BasicsDraft) => void;
  errors: ReturnType<typeof validateBuilder>['basics'];
  skills: ReturnType<typeof useSkills>;
}) {
  const set = (patch: Partial<BasicsDraft>) => onChange({ ...basics, ...patch });
  return (
    <View className="gap-4">
      <Input
        label="Project title"
        value={basics.title}
        onChangeText={(title) => set({ title })}
        placeholder="e.g. Logo and brand kit for a bakery"
        maxLength={120}
        error={errors.title}
      />
      <Input
        label="Description"
        value={basics.description}
        onChangeText={(description) => set({ description })}
        placeholder="What needs to be done, for whom, and what good looks like"
        multiline
        className="min-h-[120px]"
        textAlignVertical="top"
        maxLength={5000}
        error={errors.description}
      />
      <View className="gap-2">
        <Text variant="subheading">Category</Text>
        <View className="flex-row flex-wrap gap-2">
          {PROJECT_CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={category}
              selected={basics.category === category}
              onPress={() => set({ category })}
            />
          ))}
        </View>
        {errors.category ? (
          <Text variant="caption" tone="danger">
            Pick a category
          </Text>
        ) : null}
      </View>
      {skills.isPending ? (
        <Skeleton className="h-24" />
      ) : skills.isError ? (
        <Banner
          tone="warning"
          title="Couldn't load skills"
          message="You can continue without them."
          actionLabel="Retry"
          onAction={() => void skills.refetch()}
        />
      ) : (
        <SkillPicker
          skills={skills.data}
          selected={basics.skill_ids}
          onChange={(skill_ids) => set({ skill_ids })}
          max={MAX_SKILLS}
          error={errors.skill_ids}
        />
      )}
      <View className="gap-2">
        <Text variant="subheading">Where is the work?</Text>
        <SegmentedControl
          options={[
            { value: 'remote', label: 'Remote' },
            { value: 'onsite', label: 'On-site' },
          ]}
          value={basics.is_remote ? 'remote' : 'onsite'}
          onChange={(v) => set({ is_remote: v === 'remote' })}
        />
        <Input
          label={basics.is_remote ? 'City (optional)' : 'City'}
          value={basics.city}
          onChangeText={(city) => set({ city })}
          placeholder="e.g. Pune"
          maxLength={60}
          error={errors.city}
        />
      </View>
      <View className="gap-2">
        <Text variant="subheading">Who can see it?</Text>
        <SegmentedControl<ProjectVisibility>
          options={[
            { value: 'public', label: 'Public' },
            { value: 'invite_only', label: 'Invite only' },
          ]}
          value={basics.visibility}
          onChange={(visibility) => set({ visibility })}
        />
        <Text variant="caption">
          {basics.visibility === 'public'
            ? 'Any freelancer can find it and send a proposal.'
            : 'Only freelancers you invite can see it and send a proposal.'}
        </Text>
      </View>
    </View>
  );
}

function RulesStep({
  settings,
  onChange,
}: {
  settings: SettingsDraft;
  onChange: (next: SettingsDraft) => void;
}) {
  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text variant="subheading">Revisions per milestone</Text>
        <SegmentedControl
          options={REVISION_OPTIONS}
          value={String(settings.revision_limit)}
          onChange={(v) => onChange({ ...settings, revision_limit: Number(v) })}
        />
        <Text variant="caption">
          How many times you can ask for changes on a milestone before it must be approved or
          disputed.
        </Text>
      </View>
      <View className="gap-2">
        <Text variant="subheading">Check-in every</Text>
        <SegmentedControl
          options={CADENCE_OPTIONS}
          value={String(settings.checkin_cadence_days)}
          onChange={(v) => onChange({ ...settings, checkin_cadence_days: Number(v) })}
        />
        <Text variant="caption">
          The freelancer shares a short progress update this often (in days).
        </Text>
      </View>
    </View>
  );
}

function ReviewStep({
  basics,
  milestones,
  validation,
  onEdit,
}: {
  basics: BasicsDraft;
  milestones: readonly MilestoneDraft[];
  validation: ReturnType<typeof validateBuilder>;
  onEdit: (step: BuilderStep) => void;
}) {
  const basicsBad = Object.keys(validation.basics).length > 0;
  const milestonesBad =
    Object.keys(validation.milestones).length > 0 || validation.issues.length > 0;
  return (
    <View className="gap-4">
      {basicsBad ? (
        <Banner
          tone="warning"
          title="Project details are incomplete"
          message="Fill in the basics to publish. You can still save a draft."
          actionLabel="Edit basics"
          onAction={() => onEdit('basics')}
        />
      ) : null}
      {milestonesBad ? (
        <Banner
          tone="warning"
          title="Milestone plan needs attention"
          message={
            validation.issues.length > 0
              ? validation.issues.map(describeIssue).join('\n')
              : 'Complete every milestone field.'
          }
          actionLabel="Edit milestones"
          onAction={() => onEdit('milestones')}
        />
      ) : null}
      <Card className="gap-2">
        <Text variant="heading">{basics.title.trim() || 'Untitled project'}</Text>
        <Text variant="caption">
          {[
            basics.category,
            basics.is_remote ? 'Remote' : basics.city,
            basics.visibility === 'public' ? 'Public' : 'Invite only',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text variant="label" tone="muted" className="mt-2">
          Total
        </Text>
        <Money paise={totalPaise(milestones)} variant="title" />
      </Card>
      <Card className="gap-3">
        <Text variant="subheading">{milestones.length} milestones</Text>
        {milestones.map((m, i) => (
          <View key={m.key} className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text variant="body">
                {i + 1}. {m.title.trim() || 'Untitled'}
              </Text>
              <Text variant="caption">{m.due_date ? formatDate(m.due_date) : 'No date'}</Text>
            </View>
            <Money paise={amountToPaise(m.amount) ?? 0} variant="body" />
          </View>
        ))}
      </Card>
    </View>
  );
}
