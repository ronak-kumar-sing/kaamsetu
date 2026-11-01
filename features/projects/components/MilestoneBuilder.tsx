import { View } from 'react-native';

import { Banner, Button, Card, Input, Money, Text } from '@/components/ui';
import { milestoneCapPct } from '@/shared/schemas/projects';

import {
  MAX_MILESTONES,
  amountToPaise,
  capLabel,
  describeIssue,
  emptyMilestone,
  addRow,
  moveRow,
  planIssues,
  removeRow,
  sharePct,
  totalPaise,
  updateRow,
  milestoneFieldErrors,
  type MilestoneDraft,
} from '../builder';
import { DateField } from './DateField';
import { IconButton } from './IconButton';
import { ShareBar } from './ShareBar';

export interface MilestoneBuilderProps {
  milestones: readonly MilestoneDraft[];
  onChange: (next: MilestoneDraft[]) => void;
  today: string;
  /** Show per-field errors (after the user tried to continue). */
  showErrors: boolean;
}

export function MilestoneBuilder({
  milestones,
  onChange,
  today,
  showErrors,
}: MilestoneBuilderProps) {
  const count = milestones.length;
  const total = totalPaise(milestones);
  const issues = planIssues(milestones, today);
  const cap = milestoneCapPct(count);
  const patch = (key: string, p: Partial<MilestoneDraft>) =>
    onChange(updateRow(milestones, key, p));

  return (
    <View className="gap-4">
      <Card className="gap-1">
        <Text variant="label" tone="muted">
          Project total
        </Text>
        <Money paise={total} variant="title" />
        <Text variant="caption" accessibilityLiveRegion="polite">
          {capLabel(count)}
        </Text>
      </Card>

      {issues.length > 0 ? (
        <Banner
          tone="warning"
          title="Fix these before publishing"
          message={issues.map(describeIssue).join('\n')}
        />
      ) : null}

      {milestones.map((m, index) => {
        const errors = showErrors ? milestoneFieldErrors(m) : {};
        const pct = sharePct(milestones, index);
        const over = pct > cap;
        return (
          <Card key={m.key} className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text variant="subheading">Milestone {index + 1}</Text>
              <View className="flex-row">
                <IconButton
                  icon="up"
                  label={`Move milestone ${index + 1} up`}
                  disabled={index === 0}
                  onPress={() => onChange(moveRow(milestones, m.key, -1))}
                />
                <IconButton
                  icon="down"
                  label={`Move milestone ${index + 1} down`}
                  disabled={index === count - 1}
                  onPress={() => onChange(moveRow(milestones, m.key, 1))}
                />
                <IconButton
                  icon="remove"
                  tone="danger"
                  label={`Remove milestone ${index + 1}`}
                  disabled={count <= 1}
                  onPress={() => onChange(removeRow(milestones, m.key))}
                />
              </View>
            </View>
            <Input
              label="Title"
              value={m.title}
              onChangeText={(title) => patch(m.key, { title })}
              placeholder="e.g. First design draft"
              error={errors.title}
              maxLength={120}
            />
            <Input
              label="Deliverable"
              value={m.deliverable}
              onChangeText={(deliverable) => patch(m.key, { deliverable })}
              placeholder="What will be handed over?"
              multiline
              className="min-h-[72px]"
              textAlignVertical="top"
              error={errors.deliverable}
              maxLength={2000}
            />
            <Input
              label="Acceptance criteria"
              value={m.acceptance_criteria}
              onChangeText={(acceptance_criteria) => patch(m.key, { acceptance_criteria })}
              placeholder="How will you decide it is done?"
              multiline
              className="min-h-[72px]"
              textAlignVertical="top"
              error={errors.acceptance_criteria}
              maxLength={2000}
            />
            <Input
              label="Amount"
              value={m.amount}
              onChangeText={(amount) => patch(m.key, { amount })}
              placeholder="5000"
              keyboardType="decimal-pad"
              leftAdornment={<Text tone="muted">₹</Text>}
              error={errors.amount_paise}
            />
            <DateField
              label="Due date"
              value={m.due_date}
              onChange={(due_date) => patch(m.key, { due_date })}
              error={errors.due_date}
            />
            <View
              className="gap-1.5"
              accessible
              accessibilityLabel={`${pct} percent of the project total${over ? `, above the ${cap} percent limit` : ''}`}
            >
              <ShareBar pct={pct} over={over} />
              <Text variant="caption" tone={over ? 'danger' : 'muted'}>
                {amountToPaise(m.amount) === null ? 'Share of total: -' : `${pct}% of total`}
                {over ? ` (limit ${cap}%)` : ''}
              </Text>
            </View>
          </Card>
        );
      })}

      <Button
        title="Add milestone"
        variant="outline"
        disabled={count >= MAX_MILESTONES}
        onPress={() => onChange(addRow(milestones, emptyMilestone))}
        accessibilityHint={
          count >= MAX_MILESTONES ? `Limit of ${MAX_MILESTONES} milestones reached` : undefined
        }
      />
    </View>
  );
}
