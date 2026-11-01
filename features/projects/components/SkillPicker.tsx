import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Input, Text } from '@/components/ui';
import type { Tables } from '@/types/database';

import { Chip } from './Chip';

export interface SkillPickerProps {
  skills: readonly Pick<Tables<'skills'>, 'id' | 'name'>[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  max: number;
  error?: string;
}

const VISIBLE_WITHOUT_QUERY = 24;

export function SkillPicker({ skills, selected, onChange, max, error }: SkillPickerProps) {
  const [query, setQuery] = useState('');
  const atLimit = selected.length >= max;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = skills.filter((s) => selected.includes(s.id));
    if (q === '') {
      const rest = skills.filter((s) => !selected.includes(s.id)).slice(0, VISIBLE_WITHOUT_QUERY);
      return [...chosen, ...rest];
    }
    return skills.filter((s) => s.name.toLowerCase().includes(q) || selected.includes(s.id));
  }, [skills, selected, query]);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id));
    else if (!atLimit) onChange([...selected, id]);
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <Text variant="subheading">Skills</Text>
        <Text variant="caption">
          {selected.length} of {max} selected
        </Text>
      </View>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search skills"
        accessibilityLabel="Search skills"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View className="flex-row flex-wrap gap-2">
        {visible.map((skill) => {
          const isSelected = selected.includes(skill.id);
          return (
            <Chip
              key={skill.id}
              label={skill.name}
              selected={isSelected}
              disabled={!isSelected && atLimit}
              onPress={() => toggle(skill.id)}
            />
          );
        })}
        {visible.length === 0 ? <Text variant="caption">No skills match your search.</Text> : null}
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
