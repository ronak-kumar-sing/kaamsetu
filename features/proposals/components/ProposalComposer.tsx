import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Switch, View } from 'react-native';

import { Banner, Button, Card, Input, Money, Text } from '@/components/ui';
import { DateField } from '@/features/projects/components/DateField';
import { IconButton } from '@/features/projects/components/IconButton';
import { ShareBar } from '@/features/projects/components/ShareBar';
import {
  MAX_MILESTONES,
  addRow,
  amountToPaise,
  capLabel,
  describeIssue,
  describePriceIssue,
  emptyPlanRow,
  moveRow,
  paiseToInputText,
  planIssues,
  planRowFromMilestone,
  planRowFieldErrors,
  removeRow,
  sharePct,
  totalPaise,
  updateRow,
  type PlanRowDraft,
  type SourceMilestone,
} from '@/features/projects/builder';
import { rpcErrorMessage } from '@/features/projects/errors';
import { todayInIndia } from '@/features/projects/format';
import { formatINR } from '@/shared/money';
import { milestoneCapPct, proposalPriceIssue } from '@/shared/schemas/projects';
import { rupeeInputToPaise } from '@/shared/money';

import { useSubmitProposal } from '../api';
import { proposalFormSchema, type ProposalFormInput, type ProposalFormValues } from '../form';

export interface ComposerProject {
  id: string;
  total_paise: number;
  /** The client's current milestone plan, used to seed "suggest a different plan". */
  plan: readonly SourceMilestone[];
}

export function ProposalComposer({ project }: { project: ComposerProject }) {
  const submit = useSubmitProposal();
  const [suggest, setSuggest] = useState(false);
  const [plan, setPlan] = useState<PlanRowDraft[]>([]);
  const [showPlanErrors, setShowPlanErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const today = todayInIndia();

  const { control, handleSubmit, formState, watch, setValue } = useForm<
    ProposalFormInput,
    unknown,
    ProposalFormValues
  >({
    resolver: zodResolver(proposalFormSchema),
    defaultValues: {
      cover_note: '',
      total: paiseToInputText(project.total_paise),
      timeline_days: '30',
    },
  });

  const priceText = watch('total');
  const pricePaise = rupeeInputToPaise(priceText ?? '');
  // D26: a different price needs a plan that adds up to it.
  const planRequired = pricePaise !== null && pricePaise !== project.total_paise;
  const planActive = planRequired || suggest;

  useEffect(() => {
    if (planActive && plan.length === 0) setPlan(project.plan.map(planRowFromMilestone));
  }, [planActive, plan.length, project.plan]);

  const planTotalPaise = totalPaise(plan);
  const issues = planActive ? planIssues(plan, today) : [];
  const priceIssue =
    planActive && pricePaise !== null && plan.length > 0
      ? proposalPriceIssue(
          pricePaise,
          project.total_paise,
          plan.map((r) => ({ amount_paise: amountToPaise(r.amount) ?? 0 })),
        )
      : null;
  const planFieldsBad =
    planActive && plan.some((r) => Object.keys(planRowFieldErrors(r)).length > 0);
  const planBlocked = planActive && (issues.length > 0 || planFieldsBad || priceIssue !== null);
  const cap = milestoneCapPct(plan.length);

  const onSubmit = handleSubmit(async (values) => {
    if (submit.isPending) return;
    setShowPlanErrors(true);
    if (planBlocked) return;
    setServerError(null);
    try {
      await submit.mutateAsync({
        projectId: project.id,
        coverNote: values.cover_note,
        proposedTotalPaise: values.total,
        timelineDays: values.timeline_days,
        plan: planActive ? plan : null,
      });
      router.replace('/freelancer/proposals');
    } catch (e) {
      setServerError(rpcErrorMessage(e));
    }
  });

  const busy = formState.isSubmitting || submit.isPending;

  return (
    <View className="gap-4">
      {serverError ? (
        <Banner tone="danger" title="Couldn't send proposal" message={serverError} />
      ) : null}
      <Controller
        control={control}
        name="cover_note"
        render={({ field, fieldState }) => (
          <Input
            label="Cover note"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            placeholder="Why are you a good fit? Mention similar work you have done."
            multiline
            className="min-h-[140px]"
            textAlignVertical="top"
            maxLength={3000}
            editable={!busy}
          />
        )}
      />
      <Controller
        control={control}
        name="total"
        render={({ field, fieldState }) => (
          <Input
            label="Your total price"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            keyboardType="decimal-pad"
            leftAdornment={<Text tone="muted">₹</Text>}
            hint={`The client's budget is ${formatINR(project.total_paise)}. Changing it needs a milestone plan that adds up to your price.`}
            editable={!busy}
          />
        )}
      />
      <Controller
        control={control}
        name="timeline_days"
        render={({ field, fieldState }) => (
          <Input
            label="Timeline (days)"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            keyboardType="number-pad"
            maxLength={3}
            editable={!busy}
          />
        )}
      />

      <Card className="gap-3">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text variant="subheading">Suggest a different milestone plan</Text>
            <Text variant="caption">
              {planRequired
                ? 'Required because your price differs from the client budget.'
                : 'Optional. Keep the client price and you can skip this.'}
            </Text>
          </View>
          <Switch
            value={planActive}
            onValueChange={setSuggest}
            disabled={planRequired}
            accessibilityLabel="Suggest a different milestone plan"
          />
        </View>

        {planActive ? (
          <View className="gap-4">
            <View className="gap-1">
              <Money paise={planTotalPaise} variant="heading" />
              <Text variant="caption" accessibilityLiveRegion="polite">
                {capLabel(plan.length)}
              </Text>
            </View>
            {issues.length > 0 ? (
              <Banner
                tone="warning"
                title="Fix your plan"
                message={issues.map(describeIssue).join('\n')}
              />
            ) : null}
            {priceIssue && pricePaise !== null ? (
              <Banner
                tone="warning"
                title="Price and plan don't agree"
                message={describePriceIssue(
                  priceIssue,
                  planTotalPaise,
                  pricePaise,
                  project.total_paise,
                )}
                actionLabel={
                  priceIssue === 'plan_total_mismatch' ? 'Set price to plan total' : undefined
                }
                onAction={
                  priceIssue === 'plan_total_mismatch'
                    ? () =>
                        setValue('total', paiseToInputText(planTotalPaise), {
                          shouldValidate: true,
                        })
                    : undefined
                }
              />
            ) : null}
            {plan.map((row, index) => {
              const errors = showPlanErrors ? planRowFieldErrors(row) : {};
              const pct = sharePct(plan, index);
              return (
                <View key={row.key} className="gap-3 rounded-xl border border-border p-3">
                  <View className="flex-row items-center justify-between">
                    <Text variant="subheading">Milestone {index + 1}</Text>
                    <View className="flex-row">
                      <IconButton
                        icon="up"
                        label={`Move milestone ${index + 1} up`}
                        disabled={index === 0}
                        onPress={() => setPlan(moveRow(plan, row.key, -1))}
                      />
                      <IconButton
                        icon="down"
                        label={`Move milestone ${index + 1} down`}
                        disabled={index === plan.length - 1}
                        onPress={() => setPlan(moveRow(plan, row.key, 1))}
                      />
                      <IconButton
                        icon="remove"
                        tone="danger"
                        label={`Remove milestone ${index + 1}`}
                        disabled={plan.length <= 1}
                        onPress={() => setPlan(removeRow(plan, row.key))}
                      />
                    </View>
                  </View>
                  {row.source_milestone_id ? (
                    <View className="gap-1 rounded-lg bg-surface-muted p-2">
                      <Text variant="caption" tone="muted">
                        Deliverable (from the client, read-only)
                      </Text>
                      <Text variant="caption">{row.deliverable}</Text>
                      <Text variant="caption" tone="muted">
                        Acceptance criteria (from the client, read-only)
                      </Text>
                      <Text variant="caption">{row.acceptance_criteria}</Text>
                    </View>
                  ) : null}
                  <Input
                    label="Title"
                    value={row.title}
                    onChangeText={(title) => setPlan(updateRow(plan, row.key, { title }))}
                    error={errors.title}
                    maxLength={120}
                  />
                  <Input
                    label="Amount"
                    value={row.amount}
                    onChangeText={(amount) => setPlan(updateRow(plan, row.key, { amount }))}
                    keyboardType="decimal-pad"
                    leftAdornment={<Text tone="muted">₹</Text>}
                    error={errors.amount_paise}
                  />
                  <DateField
                    label="Due date"
                    value={row.due_date}
                    onChange={(due_date) => setPlan(updateRow(plan, row.key, { due_date }))}
                    error={errors.due_date}
                  />
                  {!row.source_milestone_id ? (
                    <>
                      <Input
                        label="Deliverable"
                        value={row.deliverable}
                        onChangeText={(deliverable) =>
                          setPlan(updateRow(plan, row.key, { deliverable }))
                        }
                        error={errors.deliverable}
                        multiline
                        textAlignVertical="top"
                        className="min-h-[72px]"
                        maxLength={2000}
                      />
                      <Input
                        label="Acceptance criteria"
                        value={row.acceptance_criteria}
                        onChangeText={(acceptance_criteria) =>
                          setPlan(updateRow(plan, row.key, { acceptance_criteria }))
                        }
                        error={errors.acceptance_criteria}
                        multiline
                        textAlignVertical="top"
                        className="min-h-[72px]"
                        maxLength={2000}
                      />
                    </>
                  ) : null}
                  <ShareBar pct={pct} over={pct > cap} />
                  <Text variant="caption" tone={pct > cap ? 'danger' : 'muted'}>
                    {amountToPaise(row.amount) === null ? '' : `${pct}% of total`}
                  </Text>
                </View>
              );
            })}
            <Button
              title="Add milestone"
              variant="outline"
              disabled={plan.length >= MAX_MILESTONES}
              onPress={() => setPlan(addRow(plan, emptyPlanRow))}
            />
          </View>
        ) : null}
      </Card>

      <Button
        title="Send proposal"
        loading={busy}
        disabled={busy || planBlocked}
        onPress={() => void onSubmit()}
      />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </View>
  );
}
