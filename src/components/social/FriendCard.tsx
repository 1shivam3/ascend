import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { THEME } from '../../constants/theme';
import { PublicUserSummary } from '../../types/social.types';
import { Card } from '../ui/Card';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface FriendCardProps {
  user: PublicUserSummary;
  relationship?: 'FRIEND' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'NONE' | 'BLOCKED';
  onPressProfile?: (userId: string) => void;
  onSendRequest?: (userId: string) => void;
  onAcceptRequest?: (userId: string) => void;
  onRejectRequest?: (userId: string) => void;
  onRemoveFriend?: (userId: string) => void;
  onBlockUser?: (userId: string) => void;
  onUnblockUser?: (userId: string) => void;
}

export const FriendCard: React.FC<FriendCardProps> = ({
  user,
  relationship = 'FRIEND',
  onPressProfile,
  onSendRequest,
  onAcceptRequest,
  onRejectRequest,
  onRemoveFriend,
  onBlockUser,
  onUnblockUser,
}) => {
  return (
    <Card variant="surface" style={styles.card}>
      <TouchableOpacity
        style={styles.infoRow}
        onPress={() => onPressProfile?.(user.id)}
        activeOpacity={0.7}
      >
        <Text style={styles.avatar}>{user.avatarUrl || '⚔️'}</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Heading level={3} style={styles.displayName}>
              {user.displayName}
            </Heading>
            <Badge
              label={`RANK ${user.rankTier}`}
              variant="amber"
              size="sm"
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Caption color={THEME.colors.cyan}>@{user.username}</Caption>
            <Caption color={THEME.colors.textMuted}>•</Caption>
            <MonoText color={THEME.colors.textSecondary} style={{ fontSize: 10 }}>
              LVL {user.globalLevel}
            </MonoText>
            {user.currentStreak !== undefined && user.currentStreak > 0 && (
              <>
                <Caption color={THEME.colors.textMuted}>•</Caption>
                <Caption color={THEME.colors.amber}>🔥 {user.currentStreak}D</Caption>
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {/* Action Buttons based on relationship */}
      <View style={styles.actionsRow}>
        <Button
          title="DOSSIER"
          variant="secondary"
          size="sm"
          onPress={() => onPressProfile?.(user.id)}
        />

        {relationship === 'FRIEND' && onRemoveFriend && (
          <Button
            title="DISMISS"
            variant="ghost"
            size="sm"
            onPress={() => onRemoveFriend(user.id)}
          />
        )}

        {relationship === 'NONE' && onSendRequest && (
          <Button
            title="+ RECRUIT"
            variant="primary"
            size="sm"
            onPress={() => onSendRequest(user.id)}
          />
        )}

        {relationship === 'REQUEST_RECEIVED' && (
          <>
            {onAcceptRequest && (
              <Button
                title="ACCEPT"
                variant="primary"
                size="sm"
                onPress={() => onAcceptRequest(user.id)}
              />
            )}
            {onRejectRequest && (
              <Button
                title="DECLINE"
                variant="ghost"
                size="sm"
                onPress={() => onRejectRequest(user.id)}
              />
            )}
          </>
        )}

        {relationship === 'REQUEST_SENT' && (
          <Badge label="TRANSMISSION SENT" variant="cyan" size="sm" />
        )}

        {relationship === 'BLOCKED' && onUnblockUser && (
          <Button
            title="UNBLOCK"
            variant="outline"
            size="sm"
            onPress={() => onUnblockUser(user.id)}
          />
        )}

        {relationship !== 'BLOCKED' && onBlockUser && (
          <TouchableOpacity
            style={styles.blockBtn}
            onPress={() => onBlockUser(user.id)}
            activeOpacity={0.6}
          >
            <Caption color={THEME.colors.textDisabled}>BLOCK</Caption>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 12,
    marginBottom: THEME.spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  avatar: {
    fontSize: 26,
  },
  displayName: {
    fontSize: 14,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    paddingTop: 8,
  },
  blockBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});
