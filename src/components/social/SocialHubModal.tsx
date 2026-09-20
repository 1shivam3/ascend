import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { THEME } from '../../constants/theme';
import { useSocialStore } from '../../store/useSocialStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { Heading, Text, Caption, MonoText } from '../ui/Typography';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ActivityFeedCard } from './ActivityFeedCard';
import { FriendCard } from './FriendCard';
import { FriendProfileModal } from './FriendProfileModal';
import { SocialPrivacyModal } from './SocialPrivacyModal';
import { ActivityReactionType, PublicUserSummary } from '../../types/social.types';

interface SocialHubModalProps {
  visible: boolean;
  onClose: () => void;
}

type TabType = 'FEED' | 'SQUAD' | 'REQUESTS';

export const SocialHubModal: React.FC<SocialHubModalProps> = ({ visible, onClose }) => {
  const profile = useAuthStore(s => s.profile);
  const userId = profile?.id || '';

  const {
    friends,
    incomingRequests,
    outgoingRequests,
    blockedUsers,
    feedItems,
    feedFilter,
    isLoading,
    loadAllSocialData,
    loadFeed,
    setFeedFilter,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    reactToActivity,
    deleteActivity,
    searchOperatives,
    searchResults,
    clearSearch,
  } = useSocialStore();

  const [activeTab, setActiveTab] = useState<TabType>('FEED');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);

  useEffect(() => {
    if (visible && userId) {
      loadAllSocialData(userId);
    }
  }, [visible, userId, loadAllSocialData]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !userId) return;
    await searchOperatives(userId, searchQuery.trim());
  };

  const handleSendRequestByIdentifier = async (identifier: string) => {
    if (!userId) return;
    try {
      await sendFriendRequest(userId, identifier);
      Alert.alert('Transmission Sent', `Friend request sent to ${identifier}.`);
      setSearchQuery('');
      clearSearch();
    } catch (err) {
      Alert.alert('Request Failed', (err as Error).message);
    }
  };

  const myFriendCode = profile?.friendCode || 'ASC-0000';

  return (
    <Modal visible={visible} onClose={onClose} title="TACTICAL SQUAD & COMMUNITY">
      {/* Top Segmented Navigation */}
      <View style={styles.topTabsRow}>
        <TouchableOpacity
          style={[styles.topTabBtn, activeTab === 'FEED' && styles.topTabBtnActive]}
          onPress={() => {
            setActiveTab('FEED');
            clearSearch();
          }}
          activeOpacity={0.8}
        >
          <Text
            style={[styles.topTabLabel, activeTab === 'FEED' && { color: THEME.colors.cyan }]}
          >
            ⚡ FEED
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.topTabBtn, activeTab === 'SQUAD' && styles.topTabBtnActive]}
          onPress={() => {
            setActiveTab('SQUAD');
            clearSearch();
          }}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              style={[styles.topTabLabel, activeTab === 'SQUAD' && { color: THEME.colors.cyan }]}
            >
              🤝 SQUAD ({friends.length})
            </Text>
            {incomingRequests.length > 0 && (
              <Badge label={String(incomingRequests.length)} variant="amber" size="sm" />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.topTabBtn, activeTab === 'REQUESTS' && styles.topTabBtnActive]}
          onPress={() => {
            setActiveTab('REQUESTS');
            clearSearch();
          }}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text
              style={[
                styles.topTabLabel,
                activeTab === 'REQUESTS' && { color: THEME.colors.cyan },
              ]}
            >
              📨 REQUESTS
            </Text>
            {incomingRequests.length > 0 && (
              <Badge label={String(incomingRequests.length)} variant="amber" size="sm" />
            )}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ========================================================================= */}
        {/* TAB: ACTIVITY FEED */}
        {/* ========================================================================= */}
        {activeTab === 'FEED' && (
          <View>
            {/* Feed Filter Pills & Privacy Gear */}
            <View style={styles.feedControlsRow}>
              <View style={styles.filterPillsRow}>
                {(['ALL', 'SQUAD', 'GLOBAL'] as const).map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filterPill, feedFilter === f && styles.filterPillActive]}
                    onPress={() => setFeedFilter(userId, f)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        feedFilter === f && { color: THEME.colors.cyan, fontWeight: '800' },
                      ]}
                    >
                      {f}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.privacyGearBtn}
                onPress={() => setPrivacyModalVisible(true)}
                activeOpacity={0.7}
              >
                <Caption color={THEME.colors.cyan}>🛡️ PRIVACY</Caption>
              </TouchableOpacity>
            </View>

            {/* Feed Items */}
            {isLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={THEME.colors.cyan} />
                <Caption color={THEME.colors.cyan} style={{ marginTop: 6 }}>
                  SYNCING SQUAD TRANSMISSIONS...
                </Caption>
              </View>
            ) : feedItems.length === 0 ? (
              <Card variant="surface" style={styles.emptyCard}>
                <Heading level={3} align="center" style={{ marginBottom: 4 }}>
                  No Transmissions Logged
                </Heading>
                <Caption align="center">
                  {feedFilter === 'SQUAD'
                    ? 'Your squadmates have not broadcasted any protocols yet. Recruit fellow operatives or complete a workout to initiate transmissions!'
                    : 'Complete a workout protocol or recruit friends to begin transmissions.'}
                </Caption>
              </Card>
            ) : (
              feedItems.map(item => (
                <ActivityFeedCard
                  key={item.id}
                  item={item}
                  currentUserId={userId}
                  onReact={(actId, rType) => reactToActivity(userId, actId, rType)}
                  onPressAuthor={authId => setSelectedProfileId(authId)}
                  onDelete={actId => deleteActivity(userId, actId)}
                />
              ))
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB: SQUAD & FRIENDS */}
        {/* ========================================================================= */}
        {activeTab === 'SQUAD' && (
          <View>
            {/* My Friend Code Banner */}
            <Card variant="elevated" accentBorder={THEME.colors.cyan} style={styles.myCodeCard}>
              <View style={styles.myCodeRow}>
                <View>
                  <Caption upper color={THEME.colors.textMuted}>YOUR TACTICAL CALLSIGN CODE</Caption>
                  <MonoText color={THEME.colors.cyan} style={styles.myCodeText}>
                    {myFriendCode}
                  </MonoText>
                  <Caption color={THEME.colors.textSecondary}>
                    Share with squadmates to connect directly
                  </Caption>
                </View>
                <Button
                  title="COPY"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    Alert.alert('Callsign Code', `Code ${myFriendCode} copied to clipboard!`);
                  }}
                />
              </View>
            </Card>

            {/* Search & Recruit Box */}
            <Card variant="surface" style={styles.searchCard}>
              <Caption upper style={styles.searchLabel}>SEARCH OPERATIVES OR ENTER CODE</Caption>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Enter username or ASC-XXXX-XXXX..."
                  placeholderTextColor={THEME.colors.textDisabled}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={handleSearch}
                />
                <Button
                  title="SEARCH"
                  variant="primary"
                  size="sm"
                  onPress={handleSearch}
                />
              </View>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <View style={styles.searchResultsContainer}>
                  <Caption upper style={styles.resultsHeader}>IDENTIFIED CANDIDATES</Caption>
                  {searchResults.map(user => (
                    <FriendCard
                      key={user.id}
                      user={user}
                      relationship={friends.some(f => f.id === user.id) ? 'FRIEND' : 'NONE'}
                      onPressProfile={uId => setSelectedProfileId(uId)}
                      onSendRequest={uId => handleSendRequestByIdentifier(user.friendCode)}
                    />
                  ))}
                </View>
              )}
            </Card>

            {/* Friends Roster */}
            <View style={styles.rosterHeaderRow}>
              <Caption upper style={styles.sectionHeader}>
                ACTIVE SQUAD ROSTER ({friends.length})
              </Caption>
            </View>

            {friends.length === 0 ? (
              <Card variant="surface" style={styles.emptyCard}>
                <Heading level={3} align="center" style={{ marginBottom: 4 }}>
                  Squad Roster Empty
                </Heading>
                <Caption align="center">
                  Search operatives above or share your tactical code to recruit operatives to your squad.
                </Caption>
              </Card>
            ) : (
              friends.map(friend => (
                <FriendCard
                  key={friend.id}
                  user={friend}
                  relationship="FRIEND"
                  onPressProfile={uId => setSelectedProfileId(uId)}
                  onRemoveFriend={async uId => {
                    await removeFriend(userId, uId);
                    Alert.alert('Squad Updated', 'Operative dismissed from squad.');
                  }}
                  onBlockUser={async uId => {
                    await blockUser(userId, uId);
                    Alert.alert('Operative Blocked', 'Operative blocked.');
                  }}
                />
              ))
            )}

            {/* Blocked Users Section Toggle */}
            {blockedUsers.length > 0 && (
              <View style={styles.blockedSection}>
                <TouchableOpacity
                  style={styles.blockedToggleRow}
                  onPress={() => setShowBlocked(!showBlocked)}
                  activeOpacity={0.7}
                >
                  <Caption color={THEME.colors.textDisabled}>
                    {showBlocked ? '▼ HIDE' : '▶ SHOW'} BLOCKED OPERATIVES ({blockedUsers.length})
                  </Caption>
                </TouchableOpacity>

                {showBlocked &&
                  blockedUsers.map(bUser => (
                    <FriendCard
                      key={bUser.id}
                      user={bUser}
                      relationship="BLOCKED"
                      onUnblockUser={async uId => {
                        await unblockUser(userId, uId);
                        Alert.alert('Operative Unblocked', 'You may now search and connect.');
                      }}
                    />
                  ))}
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB: REQUESTS */}
        {/* ========================================================================= */}
        {activeTab === 'REQUESTS' && (
          <View>
            {/* Incoming Requests */}
            <Caption upper style={styles.sectionHeader}>
              INCOMING HANDSHAKES ({incomingRequests.length})
            </Caption>

            {incomingRequests.length === 0 ? (
              <Card variant="surface" style={styles.emptyCard}>
                <Caption align="center">No pending recruitment handshakes received.</Caption>
              </Card>
            ) : (
              incomingRequests.map(req => (
                <FriendCard
                  key={req.id}
                  user={req.sender!}
                  relationship="REQUEST_RECEIVED"
                  onPressProfile={uId => setSelectedProfileId(uId)}
                  onAcceptRequest={async () => {
                    await acceptFriendRequest(userId, req.id);
                    Alert.alert('Squadmate Recruited', `${req.sender?.displayName} joined your squad!`);
                  }}
                  onRejectRequest={async () => {
                    await rejectFriendRequest(userId, req.id);
                    Alert.alert('Request Declined', 'Recruitment declined.');
                  }}
                  onBlockUser={async uId => {
                    await blockUser(userId, uId);
                    Alert.alert('Operative Blocked', 'Operative blocked.');
                  }}
                />
              ))
            )}

            {/* Outgoing Requests */}
            <Caption upper style={[styles.sectionHeader, { marginTop: 16 }]}>
              OUTGOING TRANSMISSIONS ({outgoingRequests.length})
            </Caption>

            {outgoingRequests.length === 0 ? (
              <Card variant="surface" style={styles.emptyCard}>
                <Caption align="center">No outgoing recruitment requests pending.</Caption>
              </Card>
            ) : (
              outgoingRequests.map(req => (
                <FriendCard
                  key={req.id}
                  user={req.receiver!}
                  relationship="REQUEST_SENT"
                  onPressProfile={uId => setSelectedProfileId(uId)}
                  onRemoveFriend={async () => {
                    await cancelFriendRequest(userId, req.id);
                    Alert.alert('Cancelled', 'Outgoing request cancelled.');
                  }}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Operative Public Profile Dossier Modal */}
      {selectedProfileId && (
        <FriendProfileModal
          visible={Boolean(selectedProfileId)}
          currentUserId={userId}
          targetUserId={selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
          onSendRequest={async targetId => {
            await sendFriendRequest(userId, targetId);
          }}
          onAcceptRequest={async targetId => {
            const req = incomingRequests.find(r => r.senderId === targetId);
            if (req) await acceptFriendRequest(userId, req.id);
          }}
          onRejectRequest={async targetId => {
            const req = incomingRequests.find(r => r.senderId === targetId);
            if (req) await rejectFriendRequest(userId, req.id);
          }}
          onRemoveFriend={async targetId => {
            await removeFriend(userId, targetId);
          }}
          onBlockUser={async targetId => {
            await blockUser(userId, targetId);
          }}
        />
      )}

      {/* Privacy Settings Modal */}
      <SocialPrivacyModal
        visible={privacyModalVisible}
        userId={userId}
        onClose={() => setPrivacyModalVisible(false)}
        onSaved={() => loadAllSocialData(userId)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  topTabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    paddingBottom: 8,
    marginBottom: 12,
  },
  topTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: THEME.borderRadius.sharp,
  },
  topTabBtnActive: {
    backgroundColor: THEME.colors.surfaceElevated,
  },
  topTabLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: THEME.colors.textMuted,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  feedControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.sharp,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  filterPillActive: {
    borderColor: THEME.colors.cyan,
    backgroundColor: THEME.colors.cyanSubtle,
  },
  filterPillText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: '700',
  },
  privacyGearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  loadingBox: {
    padding: 36,
    alignItems: 'center',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  myCodeCard: {
    padding: 12,
    marginBottom: 12,
  },
  myCodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  myCodeText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginVertical: 2,
  },
  searchCard: {
    padding: 12,
    marginBottom: 12,
  },
  searchLabel: {
    fontSize: 10,
    marginBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: THEME.colors.textPrimary,
    fontSize: 12,
  },
  searchResultsContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    paddingTop: 8,
  },
  resultsHeader: {
    fontSize: 9,
    marginBottom: 6,
  },
  rosterHeaderRow: {
    marginBottom: 6,
  },
  sectionHeader: {
    letterSpacing: 1.2,
    fontWeight: '800',
    marginBottom: 8,
  },
  blockedSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    paddingTop: 10,
  },
  blockedToggleRow: {
    paddingVertical: 6,
    marginBottom: 6,
  },
});
