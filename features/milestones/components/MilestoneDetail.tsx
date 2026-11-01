import { Linking, View } from 'react-native';
import { useState } from 'react';

import { FadeContent } from '@/components/motion/FadeContent';
import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  Input,
  Money,
  Screen,
  Skeleton,
  StatusChip,
  Text,
  MILESTONE_STATUS_META,
} from '@/components/ui';
import { useProject, useUserId } from '@/features/projects/api';
import { BottomSheet } from '@/features/projects/components/BottomSheet';
import { rpcErrorMessage } from '@/features/projects/errors';
import { dueLabel, formatDate, relativeTime, todayInIndia } from '@/features/projects/format';

import {
  useApproveMilestone,
  useMilestone,
  useMilestoneHistory,
  useMilestoneSubmissions,
  useRequestRevision,
  useStartMilestone,
  useSubmitMilestone,
  type MilestoneRow,
} from '../api';
import { parseLinks, revisionNoteSchema, revisionsRemaining, submitWorkSchema } from '../forms';

export function MilestoneDetail({ id }: { id: string }) {
  const userId = useUserId();
  const milestone = useMilestone(id);
  const project = useProject(milestone.data?.project_id);

  if (milestone.isPending) {
    return (
      <Screen edges={['bottom']}>
        <View className="gap-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-32" />
        </View>
      </Screen>
    );
  }
  if (milestone.isError) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          message={rpcErrorMessage(milestone.error)}
          onRetry={() => void milestone.refetch()}
        />
      </Screen>
    );
  }
  if (!milestone.data) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          title="Milestone not found"
          message="It may have been removed, or you may not have access."
        />
      </Screen>
    );
  }
  if (project.isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton className="h-32" />
      </Screen>
    );
  }
  if (!project.data) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          message="We couldn't load this milestone's project."
          onRetry={() => void project.refetch()}
        />
      </Screen>
    );
  }

  const role =
    project.data.client_id === userId
      ? 'client'
      : project.data.freelancer_id === userId
        ? 'freelancer'
        : null;

  return (
    <MilestoneBody
      milestone={milestone.data}
      projectStatus={project.data.status}
      revisionLimit={project.data.revision_limit}
      role={role}
    />
  );
}

function MilestoneBody({
  milestone,
  projectStatus,
  revisionLimit,
  role,
}: {
  milestone: MilestoneRow;
  projectStatus: string;
  revisionLimit: number;
  role: 'client' | 'freelancer' | null;
}) {
  const history = useMilestoneHistory(milestone.id);
  const submissions = useMilestoneSubmissions(milestone.id);
  const start = useStartMilestone();
  const approve = useApproveMilestone();
  const [sheet, setSheet] = useState<'submit' | 'revise' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const ref = { milestoneId: milestone.id, projectId: milestone.project_id };
  const remaining = revisionsRemaining(revisionLimit, milestone.revision_count);
  const today = todayInIndia();

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(rpcErrorMessage(e));
    }
  };

  const status = milestone.status;
  const freelancerCanStart =
    role === 'freelancer' && (status === 'funded' || status === 'revision_requested');
  const freelancerCanSubmit = role === 'freelancer' && status === 'in_progress';
  const clientCanReview = role === 'client' && status === 'submitted';
  const awaitingFunding = status === 'draft' && projectStatus === 'awarded';

  return (
    <Screen scroll edges={['bottom']}>
      <View className="gap-6">
        <FadeContent className="gap-2">
          <StatusChip status={status} />
          <Text variant="title">{milestone.title}</Text>
          <View className="flex-row items-center justify-between">
            <Money paise={milestone.amount_paise} variant="heading" />
            <Text variant="caption">
              Due {formatDate(milestone.due_date)} · {dueLabel(milestone.due_date, today)}
            </Text>
          </View>
          <Text variant="caption">Milestone {milestone.position}</Text>
        </FadeContent>

        {awaitingFunding ? (
          <Banner
            tone="info"
            title="Not funded yet"
            message="Funding opens after the agreement is signed (coming next)."
          />
        ) : null}
        {status === 'revision_requested' && role === 'freelancer' ? (
          <Banner
            tone="warning"
            title="Changes requested"
            message="Read the client's note below, then start again."
          />
        ) : null}
        {actionError ? (
          <Banner tone="danger" title="That didn't work" message={actionError} />
        ) : null}

        <Section title="Deliverable">
          <Text variant="body">{milestone.deliverable || 'Not specified.'}</Text>
        </Section>
        <Section title="Acceptance criteria">
          <Text variant="body">{milestone.acceptance_criteria || 'Not specified.'}</Text>
        </Section>

        {role ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge
              label={`Revisions used: ${milestone.revision_count} of ${revisionLimit}`}
              tone={remaining === 0 ? 'warning' : 'neutral'}
            />
          </View>
        ) : null}

        {freelancerCanStart ? (
          <Button
            title={status === 'funded' ? 'Start milestone' : 'Resume work'}
            loading={start.isPending}
            onPress={() => void run(() => start.mutateAsync(ref))}
          />
        ) : null}
        {freelancerCanSubmit ? (
          <Button title="Submit work" onPress={() => setSheet('submit')} />
        ) : null}
        {clientCanReview ? (
          <View className="gap-3">
            <Button
              title="Approve milestone"
              loading={approve.isPending}
              onPress={() => void run(() => approve.mutateAsync(ref))}
              accessibilityHint="Accepts the work. Payment is released in a later step."
            />
            <Button
              title={
                remaining > 0 ? `Request revision (${remaining} left)` : 'Revision limit reached'
              }
              variant="outline"
              disabled={remaining === 0}
              onPress={() => setSheet('revise')}
            />
          </View>
        ) : null}

        <Section title="Submissions">
          {submissions.isPending ? (
            <Skeleton className="h-16" />
          ) : submissions.isError ? (
            <Banner
              tone="warning"
              title="Couldn't load submissions"
              actionLabel="Retry"
              onAction={() => void submissions.refetch()}
            />
          ) : submissions.data.length === 0 ? (
            <Text variant="caption">Nothing submitted yet.</Text>
          ) : (
            submissions.data.map((s) => (
              <Card key={s.id} className="gap-2">
                <Text variant="caption">{relativeTime(s.created_at)}</Text>
                <Text variant="body">{s.note}</Text>
                {s.links.map((link) => (
                  <Button
                    key={link}
                    title={link}
                    variant="ghost"
                    size="sm"
                    onPress={() => void Linking.openURL(link)}
                    accessibilityHint="Opens the link in your browser"
                  />
                ))}
              </Card>
            ))
          )}
        </Section>

        <Section title="History">
          {history.isPending ? (
            <Skeleton className="h-16" />
          ) : history.isError ? (
            <Banner
              tone="warning"
              title="Couldn't load history"
              actionLabel="Retry"
              onAction={() => void history.refetch()}
            />
          ) : history.data.length === 0 ? (
            <Text variant="caption">No changes yet.</Text>
          ) : (
            history.data.map((h) => (
              <View key={h.id} className="gap-0.5 border-l-2 border-border pl-3">
                <Text variant="body">
                  {h.from_status ? `${MILESTONE_STATUS_META[h.from_status].label} → ` : ''}
                  {MILESTONE_STATUS_META[h.to_status].label}
                </Text>
                <Text variant="caption">
                  {h.actor_kind} · {relativeTime(h.created_at)}
                </Text>
                {h.note ? <Text variant="caption">{h.note}</Text> : null}
              </View>
            ))
          )}
        </Section>
      </View>

      <SubmitWorkSheet
        visible={sheet === 'submit'}
        onClose={() => setSheet(null)}
        milestoneRef={ref}
      />
      <RevisionSheet
        visible={sheet === 'revise'}
        onClose={() => setSheet(null)}
        milestoneRef={ref}
        remaining={remaining}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

function SubmitWorkSheet({
  visible,
  onClose,
  milestoneRef,
}: {
  visible: boolean;
  onClose: () => void;
  milestoneRef: { milestoneId: string; projectId: string };
}) {
  const submit = useSubmitMilestone();
  const [note, setNote] = useState('');
  const [linksText, setLinksText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | undefined>();
  const [linksError, setLinksError] = useState<string | undefined>();

  const send = async () => {
    if (submit.isPending) return;
    const parsedNote = submitWorkSchema.safeParse({ note });
    const parsedLinks = parseLinks(linksText);
    setNoteError(parsedNote.success ? undefined : parsedNote.error.issues[0]?.message);
    setLinksError(parsedLinks.error);
    if (!parsedNote.success || parsedLinks.error) return;
    setError(null);
    try {
      await submit.mutateAsync({
        ...milestoneRef,
        note: parsedNote.data.note,
        links: parsedLinks.links,
      });
      setNote('');
      setLinksText('');
      onClose();
    } catch (e) {
      setError(rpcErrorMessage(e));
    }
  };

  return (
    <BottomSheet visible={visible} title="Submit your work" onClose={onClose}>
      {error ? <Banner tone="danger" title="Couldn't submit" message={error} /> : null}
      <Input
        label="Note to the client"
        value={note}
        onChangeText={setNote}
        placeholder="What are you delivering?"
        multiline
        className="min-h-[96px]"
        textAlignVertical="top"
        error={noteError}
        maxLength={2000}
      />
      <Input
        label="Links (optional, https)"
        value={linksText}
        onChangeText={setLinksText}
        placeholder="https://drive.google.com/..."
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        multiline
        className="min-h-[72px]"
        textAlignVertical="top"
        error={linksError}
        hint="One link per line. File uploads are coming soon."
      />
      <Button title="Submit for approval" loading={submit.isPending} onPress={() => void send()} />
      <Button title="Cancel" variant="ghost" onPress={onClose} />
    </BottomSheet>
  );
}

function RevisionSheet({
  visible,
  onClose,
  milestoneRef,
  remaining,
}: {
  visible: boolean;
  onClose: () => void;
  milestoneRef: { milestoneId: string; projectId: string };
  remaining: number;
}) {
  const revise = useRequestRevision();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (revise.isPending) return;
    const parsed = revisionNoteSchema.safeParse({ note });
    setNoteError(parsed.success ? undefined : parsed.error.issues[0]?.message);
    if (!parsed.success) return;
    setError(null);
    try {
      await revise.mutateAsync({ ...milestoneRef, note: parsed.data.note });
      setNote('');
      onClose();
    } catch (e) {
      setError(rpcErrorMessage(e));
    }
  };

  return (
    <BottomSheet visible={visible} title="Request a revision" onClose={onClose}>
      {error ? <Banner tone="danger" title="Couldn't request revision" message={error} /> : null}
      <Text variant="body">
        You have {remaining} {remaining === 1 ? 'revision' : 'revisions'} left on this milestone.
      </Text>
      <Input
        label="What needs to change?"
        value={note}
        onChangeText={setNote}
        multiline
        className="min-h-[96px]"
        textAlignVertical="top"
        error={noteError}
        maxLength={2000}
      />
      <Button title="Send request" loading={revise.isPending} onPress={() => void send()} />
      <Button title="Cancel" variant="ghost" onPress={onClose} />
    </BottomSheet>
  );
}
