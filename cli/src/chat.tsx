import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import type { FeedbackCategory } from '@codebuff/common/constants/feedback'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useShallow } from 'zustand/react/shallow'

import { routeUserPrompt, addBashMessageToHistory } from './commands/router'
import { ChatInputBar } from './components/chat-input-bar'
import { ChatHeader } from './components/chat-header'
import { LoadPreviousButton } from './components/load-previous-button'
import { ReviewScreen } from './components/review-screen'
import { ProviderLoginScreen } from './components/provider-login-screen'
import { ProviderManagerScreen } from './components/provider-manager-screen'
import { ModelSelectorScreen } from './components/model-selector-screen'
import { SearchSetupScreen } from './components/search-setup-screen'
import { TokenUsageScreen } from './components/token-usage-screen'
import { SessionRenameScreen } from './components/session-rename-screen'
import { ChatTransferScreen } from './components/chat-transfer-screen'
import { RewindScreen } from './components/rewind-screen'
import { ConfigScreen } from './components/config-screen'
import { VerifiedCommitScreen } from './components/verified-commit-screen'
import { MessageWithAgents } from './components/message-with-agents'
import { PendingBashMessage } from './components/pending-bash-message'
import { StatusBar } from './components/status-bar'
import { TopBanner } from './components/top-banner'
import { getSlashCommandsWithSkills } from './data/slash-commands'
import { useAgentValidation } from './hooks/use-agent-validation'
import { useAskUserBridge } from './hooks/use-ask-user-bridge'
import { useChatInput } from './hooks/use-chat-input'
import {
  useChatKeyboard,
  type ChatKeyboardHandlers,
} from './hooks/use-chat-keyboard'
import { useChatMessages } from './hooks/use-chat-messages'
import { useChatState } from './hooks/use-chat-state'
import { useChatStreaming } from './hooks/use-chat-streaming'
import { useChatUI } from './hooks/use-chat-ui'
import { useClipboard } from './hooks/use-clipboard'
import { useEvent } from './hooks/use-event'
import { useInputHistory } from './hooks/use-input-history'
import { usePublishMutation } from './hooks/use-publish-mutation'
import { useSendMessage } from './hooks/use-send-message'
import { useSuggestionEngine } from './hooks/use-suggestion-engine'
import { getProjectRoot, setCurrentChatId } from './project-files'
import { useChatHistoryStore } from './state/chat-history-store'
import { useCustomProviderStore } from './state/custom-provider-store'
import { useChatStore } from './state/chat-store'
import { useReviewStore } from './state/review-store'
import { useFeedbackStore } from './state/feedback-store'
import { useMessageBlockStore } from './state/message-block-store'
import { usePublishStore } from './state/publish-store'
import { trackEvent } from './utils/analytics'
import { showClipboardMessage } from './utils/clipboard'
import { readClipboardImage } from './utils/clipboard-image'
import { getSystemMessage } from './utils/message-history'
import { getInputModeConfig } from './utils/input-modes'

import {
  type ChatKeyboardState,
  createDefaultChatKeyboardState,
} from './utils/keyboard-actions'
import { loadLocalAgents } from './utils/local-agent-registry'
import { logger } from './utils/logger'
import {
  addClipboardPlaceholder,
  addPendingFileFromPath,
  addPendingImageFromFile,
  validateAndAddImage,
} from './utils/pending-attachments'
import { getLoadedSkills } from './utils/skill-registry'
import {
  getStatusIndicatorState,
  type AuthStatus,
} from './utils/status-indicator-state'
import { createPasteHandler } from './utils/strings'
import { getCurrentSessionName } from './utils/session-name'
import { setTerminalTitle } from './utils/terminal-title'
import { abortActiveRun } from './utils/active-run'
import {
  restoreRewindCheckpoint,
  type RewindRestoreMode,
} from './utils/rewind-checkpoints'
import {
  resolveCurrentChatDir,
  saveRewoundChatState,
  settleCheckpointSave,
} from './utils/run-state-storage'
import { computeInputLayoutMetrics } from './utils/text-layout'
import { getCodebuffClient } from './utils/codebuff-client'
import {
  invalidateProjectContextCache,
  prefetchProjectContextSummary,
} from './utils/project-context'

import type { CommandResult } from './commands/command-registry'
import type { ModelChoice } from './components/model-selector-screen'
import type { CustomProviderDefinition } from './utils/custom-providers'
import type { MultilineInputHandle } from './components/multiline-input'
import type { MatchedSlashCommand } from './hooks/use-suggestion-engine'
import type { User } from './utils/auth'
import type { AgentMode } from './utils/constants'
import type { ImportedChat } from './utils/chat-transfer'
import type {
  PendingVerifiedCommit,
  VerifiedCommitResult,
} from './utils/verified-commit'
import type { FileTreeNode } from '@codebuff/common/util/file'
import type { BoxRenderable, ScrollBoxRenderable } from '@opentui/core'
import type { UseMutationResult } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'

export const Chat = ({
  initialPrompt,
  agentId,
  fileTree,
  inputRef,
  setIsAuthenticated,
  setUser,
  logoutMutation,
  continueChat,
  continueChatId,
  authStatus,
  initialMode,
  gitRoot,
  onSwitchToGitRoot,
}: {
  initialPrompt: string | null
  agentId?: string
  fileTree: FileTreeNode[]
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  setIsAuthenticated: Dispatch<SetStateAction<boolean | null>>
  setUser: Dispatch<SetStateAction<User | null>>
  logoutMutation: UseMutationResult<boolean, Error, void, unknown>
  continueChat: boolean
  continueChatId?: string
  authStatus: AuthStatus
  initialMode?: AgentMode
  gitRoot?: string | null
  onSwitchToGitRoot?: () => void
}) => {
  const [forceFileOnlyMentions, setForceFileOnlyMentions] = useState(false)
  const headerRef = useRef<BoxRenderable | null>(null)
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const [providerLoginOpen, setProviderLoginOpen] = useState(false)
  const [providerManagerOpen, setProviderManagerOpen] = useState(false)
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [searchSetupOpen, setSearchSetupOpen] = useState(false)
  const [tokenUsageOpen, setTokenUsageOpen] = useState(false)
  const [sessionRenameOpen, setSessionRenameOpen] = useState(false)
  const [rewindOpen, setRewindOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [pendingVerifiedCommit, setPendingVerifiedCommit] =
    useState<PendingVerifiedCommit | null>(null)
  const [chatTransfer, setChatTransfer] = useState<{
    mode: 'export' | 'import'
    initialPath?: string
  } | null>(null)


  const { validate: validateAgents } = useAgentValidation()

  // Subscribe to ask_user bridge to trigger form display
  useAskUserBridge()

  // Get chat state from extracted hook
  const {
    inputValue,
    cursorPosition,
    lastEditDueToNav,
    setInputValue,
    inputFocused,
    setInputFocused,
    slashSelectedIndex,
    setSlashSelectedIndex,
    agentSelectedIndex,
    setAgentSelectedIndex,
    focusedAgentId,
    setFocusedAgentId,
    messages,
    setMessages,
    agentMode,
    setAgentMode,
    toggleAgentMode,
    isRetrying,
    pendingBashMessages,
    refs: {
      activeAgentStreamsRef,
      isChainInProgressRef,
      activeSubagentsRef,
      abortControllerRef,
      sendMessageRef,
    },
  } = useChatState()

  const { statusMessage } = useClipboard()

  // Set initial mode from CLI flag on mount
  useEffect(() => {
    if (initialMode) {
      setAgentMode(initialMode)
    }
  }, [initialMode, setAgentMode])

  const prefetchPersistentProjectContext = useCallback(async () => {
    try {
      const client = await getCodebuffClient()
      if (!client) return
      await prefetchProjectContextSummary({
        projectRoot: getProjectRoot(),
        client,
      })
    } catch (error) {
      logger.warn({ error }, '[contexto] Failed to prefetch project context')
    }
  }, [])

  // Warm the contexto/ summary when the project opens. The fingerprinted
  // cache means unchanged projects do not spend another model call.
  useEffect(() => {
    void prefetchPersistentProjectContext()
  }, [prefetchPersistentProjectContext])

  // Use extracted chat messages hook for message tree and pagination
  const {
    messageTree,
    visibleTopLevelMessages,
    hiddenMessageCount,
    handleCollapseToggle,
    isUserCollapsing,
    handleLoadPreviousMessages,
    handleToggleAll,
  } = useChatMessages({ messages, setMessages })

  // Use extracted UI hook for scroll, terminal dimensions, and theme
  const {
    scrollRef,
    scrollToLatest,
    scrollUp,
    scrollDown,
    appliedScrollboxProps,
    isAtBottom,
    hasOverflow,
    terminalWidth,
    terminalHeight,
    separatorWidth,
    messageAvailableWidth,
    isCompactHeight,
    isNarrowWidth,
    theme,
    markdownPalette,
  } = useChatUI({ messages, isUserCollapsing })

  const updateHeaderVisibility = useCallback(() => {
    const header = headerRef.current
    const viewport = scrollRef.current?.viewport
    if (!header || !viewport) return

    const headerTop = header.screenY
    const headerBottom = headerTop + header.height
    const viewportTop = viewport.screenY
    const viewportBottom = viewportTop + viewport.height
    const visible = headerTop < viewportBottom && headerBottom > viewportTop
    setIsHeaderVisible((current) => (current === visible ? current : visible))
  }, [scrollRef])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const timeoutId = setTimeout(updateHeaderVisibility, 0)
    scrollbox.verticalScrollBar.on('change', updateHeaderVisibility)
    return () => {
      clearTimeout(timeoutId)
      scrollbox.verticalScrollBar.off('change', updateHeaderVisibility)
    }
  }, [scrollRef, updateHeaderVisibility])

  useEffect(() => {
    const timeoutId = setTimeout(updateHeaderVisibility, 0)
    return () => clearTimeout(timeoutId)
  }, [messages, terminalHeight, terminalWidth, updateHeaderVisibility])

  const localAgents = useMemo(() => loadLocalAgents(agentMode), [agentMode])
  const inputMode = useChatStore((state) => state.inputMode)
  const setInputMode = useChatStore((state) => state.setInputMode)
  const askUserState = useChatStore((state) => state.askUserState)
  const hasActiveContextWindow = useCustomProviderStore((state) => {
    const provider = state.config.providers.find(
      (candidate) => candidate.id === state.config.activeProviderId,
    )
    if (!provider) return false
    return Boolean(
      provider.models.find(
        (model) => model.id === state.config.activeModelId,
      ) ?? provider.models[0],
    )
  })

  // Get loaded skills for slash commands
  const loadedSkills = useMemo(() => getLoadedSkills(), [])

  // Merge built-in commands with project and global skills.
  const filteredSlashCommands = useMemo(
    () => getSlashCommandsWithSkills(loadedSkills),
    [loadedSkills],
  )

  const {
    slashContext,
    mentionContext,
    slashMatches,
    agentMatches,
    fileMatches,
    slashSuggestionItems,
    agentSuggestionItems,
    fileSuggestionItems,
  } = useSuggestionEngine({
    disableAgentSuggestions: forceFileOnlyMentions || inputMode !== 'default',
    inputValue: inputMode === 'bash' ? '' : inputValue,
    cursorPosition,
    slashCommands: filteredSlashCommands,
    localAgents,
    fileTree,
    currentAgentMode: agentMode,
  })

  useEffect(() => {
    if (!mentionContext.active) {
      setForceFileOnlyMentions(false)
    }
  }, [mentionContext.active])

  // Track when slash menu is activated
  const prevSlashActiveRef = useRef(false)
  useEffect(() => {
    if (slashContext.active && !prevSlashActiveRef.current) {
      trackEvent(AnalyticsEvent.SLASH_MENU_ACTIVATED, {
        queryLength: slashContext.query.length,
        matchCount: slashMatches.length,
        inputLength: inputValue.length,
      })
    }
    prevSlashActiveRef.current = slashContext.active
  }, [
    slashContext.active,
    slashContext.query,
    slashMatches.length,
    inputValue.length,
  ])

  // Reset suggestion menu indexes when context changes
  useEffect(() => {
    if (!slashContext.active) {
      setSlashSelectedIndex(0)
      return
    }
    setSlashSelectedIndex(0)
  }, [slashContext.active, slashContext.query, setSlashSelectedIndex])

  useEffect(() => {
    if (slashMatches.length > 0 && slashSelectedIndex >= slashMatches.length) {
      setSlashSelectedIndex(slashMatches.length - 1)
    }
    if (slashMatches.length === 0 && slashSelectedIndex !== 0) {
      setSlashSelectedIndex(0)
    }
  }, [slashMatches.length, slashSelectedIndex, setSlashSelectedIndex])

  useEffect(() => {
    if (!mentionContext.active) {
      setAgentSelectedIndex(0)
      return
    }
    setAgentSelectedIndex(0)
  }, [mentionContext.active, mentionContext.query, setAgentSelectedIndex])

  useEffect(() => {
    const totalMatches = agentMatches.length + fileMatches.length
    if (totalMatches > 0 && agentSelectedIndex >= totalMatches) {
      setAgentSelectedIndex(totalMatches - 1)
    }
    if (totalMatches === 0 && agentSelectedIndex !== 0) {
      setAgentSelectedIndex(0)
    }
  }, [
    agentMatches.length,
    fileMatches.length,
    agentSelectedIndex,
    setAgentSelectedIndex,
  ])

  const openFileMenuWithTab = useCallback(() => {
    const safeCursor = Math.max(0, Math.min(cursorPosition, inputValue.length))

    let wordStart = safeCursor
    while (wordStart > 0 && !/\s/.test(inputValue[wordStart - 1])) {
      wordStart--
    }

    const before = inputValue.slice(0, wordStart)
    const wordAtCursor = inputValue.slice(wordStart, safeCursor)
    const after = inputValue.slice(safeCursor)
    const mentionWord = wordAtCursor.startsWith('@')
      ? wordAtCursor
      : `@${wordAtCursor}`

    const text = `${before}${mentionWord}${after}`
    const nextCursor = before.length + mentionWord.length

    setInputValue({
      text,
      cursorPosition: nextCursor,
      lastEditDueToNav: false,
    })
    setForceFileOnlyMentions(true)
  }, [cursorPosition, inputValue, setInputValue])

  const { saveToHistory, navigateUp, navigateDown, resetHistoryNavigation } =
    useInputHistory(inputValue, setInputValue, { inputMode, setInputMode })

  // Use extracted streaming hook for connection, timer, queue, and exit handling
  const {
    isConnected,
    showReconnectionMessage,
    mainAgentTimer,
    timerStartTime,
    streamStatus,
    isWaitingForResponse,
    isStreaming,
    setStreamStatus,
    queuedMessages,
    queuePaused,
    streamMessageIdRef,
    addToQueue,
    stopStreaming,
    setCanProcessQueue,
    pauseQueue,
    resumeQueue,
    clearQueue,
    isQueuePausedRef,
    isProcessingQueueRef,
    queuedCount,
    shouldShowQueuePreview,
    queuePreviewTitle,
    pausedQueueText,
    inputPlaceholder,
    handleCtrlC,
    ensureQueueActiveBeforeSubmit,
    nextCtrlCWillExit,
  } = useChatStreaming({
    agentMode,
    inputValue,
    setInputValue,
    terminalWidth,
    separatorWidth,
    isChainInProgressRef,
    activeAgentStreamsRef,
    sendMessageRef,
  })

  // When streaming completes, flush any pending bash commands into history (ghost mode only)
  // Non-ghost mode commands are already in history and will be cleared when user sends next message
  useEffect(() => {
    if (
      !isStreaming &&
      !streamMessageIdRef.current &&
      !isChainInProgressRef.current &&
      pendingBashMessages.length > 0
    ) {
      // Only flush ghost mode commands (those not already added to history) to UI
      const ghostModeMessages = pendingBashMessages.filter(
        (msg) => !msg.isRunning && !msg.addedToHistory,
      )

      // Add ghost mode messages to UI history
      for (const msg of ghostModeMessages) {
        addBashMessageToHistory({
          command: msg.command,
          stdout: msg.stdout,
          stderr: msg.stderr ?? null,
          exitCode: msg.exitCode,
          cwd: msg.cwd || process.cwd(),
          setMessages,
        })
      }

      // Mark ghost mode messages as added to history (so they don't show as ghost UI)
      // but keep them in pendingBashMessages so they get sent to LLM with next user message
      if (ghostModeMessages.length > 0) {
        const ghostIds = new Set(ghostModeMessages.map((m) => m.id))
        useChatStore.setState((state) => ({
          pendingBashMessages: state.pendingBashMessages.map((m) =>
            ghostIds.has(m.id) ? { ...m, addedToHistory: true } : m,
          ),
        }))
      }
    }
  }, [isStreaming, pendingBashMessages, setMessages])

  const handleVerifiedCommitReady = useCallback(
    (pending: PendingVerifiedCommit) => {
      pauseQueue()
      setPendingVerifiedCommit(pending)
      setInputFocused(false)
    },
    [pauseQueue, setInputFocused],
  )

  const { sendMessage, clearMessages, replaceRunState } = useSendMessage({
    inputRef,
    activeSubagentsRef,
    isChainInProgressRef,
    setStreamStatus,
    setCanProcessQueue,
    abortControllerRef,
    agentId,
    onBeforeMessageSend: validateAgents,
    mainAgentTimer,
    scrollToLatest,
    onTimerEvent: () => {},
    isQueuePausedRef,
    isProcessingQueueRef,
    resumeQueue,
    continueChat,
    continueChatId,
    onVerifiedCommitReady: handleVerifiedCommitReady,
  })

  sendMessageRef.current = sendMessage

  const onSubmitPrompt = useEvent(
    async (
      content: string,
      mode: AgentMode,
      options?: { preserveInputValue?: boolean },
    ) => {
      ensureQueueActiveBeforeSubmit()

      const preserveInput = options?.preserveInputValue === true
      const previousInputValue = preserveInput
        ? (() => {
            const {
              inputValue: text,
              cursorPosition,
              lastEditDueToNav,
            } = useChatStore.getState()
            return { text, cursorPosition, lastEditDueToNav }
          })()
        : null

      // Preserve attachments if needed (inline logic to avoid abstraction overhead)
      const preservedAttachments = preserveInput
        ? (() => {
            const items = useChatStore.getState().pendingAttachments
            if (items.length > 0) {
              useChatStore.getState().clearPendingAttachments()
              return [...items]
            }
            return null
          })()
        : null

      try {
        const result = await routeUserPrompt({
          abortControllerRef,
          agentMode: mode,
          inputRef,
          inputValue: content,
          isChainInProgressRef,
          isStreaming,
          logoutMutation,
          streamMessageIdRef,
          addToQueue,
          clearMessages,
          saveToHistory,
          scrollToLatest,
          sendMessage,
          setCanProcessQueue,
          setInputFocused,
          setInputValue,
          setIsAuthenticated,
          setMessages,
          setUser,
          stopStreaming,
        })

        return result
      } finally {
        if (previousInputValue) {
          setInputValue({
            text: previousInputValue.text,
            cursorPosition: previousInputValue.cursorPosition,
            lastEditDueToNav: previousInputValue.lastEditDueToNav,
          })
        }

        // Restore attachments if they were preserved and none have been added since
        if (
          preservedAttachments &&
          useChatStore.getState().pendingAttachments.length === 0
        ) {
          useChatStore.setState((state) => {
            state.pendingAttachments = preservedAttachments
          })
        }
      }
    },
  )


  // Plan cards can request a revision without reintroducing a /plan command.
  // The mode toggle remains the single entry point for planning.
  useEffect(() => {
    const handleRevisePlan = () => {
      setAgentMode('PLAN')
      const prompt = 'Revisa el plan anterior con estos cambios: '
      setInputValue({
        text: prompt,
        cursorPosition: prompt.length,
        lastEditDueToNav: false,
      })
      setInputFocused(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
    globalThis.addEventListener('codewolf:revise-plan', handleRevisePlan)
    return () =>
      globalThis.removeEventListener('codewolf:revise-plan', handleRevisePlan)
  }, [inputRef, setAgentMode, setInputFocused, setInputValue])

  // Handle followup suggestion clicks
  useEffect(() => {
    const handleFollowupClick = (event: Event) => {
      const customEvent = event as CustomEvent<{
        prompt: string
        index: number
        toolCallId: string
      }>
      const { prompt, index, toolCallId } = customEvent.detail

      logger.info(
        { promptLength: prompt.length, index, toolCallId, agentMode },
        '[followup-click] Followup clicked',
      )

      // Track analytics event
      trackEvent(AnalyticsEvent.FOLLOWUP_CLICKED, {
        promptLength: prompt.length,
        index,
        agentMode,
      })

      // Mark this followup as clicked (persisted per toolCallId)
      useChatStore.getState().markFollowupClicked(toolCallId, index)

      // Send the followup prompt directly, preserving the user's current input
      onSubmitPrompt(prompt, agentMode, {
        preserveInputValue: true,
      })
        .then((result) => {
          logger.info(
            { hasResult: !!result },
            '[followup-click] onSubmitPrompt completed',
          )
        })
        .catch((error) => {
          logger.error(
            { error },
            '[followup-click] onSubmitPrompt failed with error',
          )
          showClipboardMessage('No se pudo enviar la continuación', {
            durationMs: 3000,
          })
        })
    }

    globalThis.addEventListener('codebuff:send-followup', handleFollowupClick)
    return () => {
      globalThis.removeEventListener(
        'codebuff:send-followup',
        handleFollowupClick,
      )
    }
  }, [onSubmitPrompt, agentMode])

  // handleSlashItemClick is defined later after feedback/publish stores are available

  const handleMentionItemClick = useCallback(
    (index: number) => {
      if (mentionContext.startIndex < 0) return

      let replacement: string
      if (index < agentMatches.length) {
        const selected = agentMatches[index]
        if (!selected) return
        replacement = `@${selected.id} `
      } else {
        const fileIndex = index - agentMatches.length
        const selectedFile = fileMatches[fileIndex]
        if (!selectedFile) return
        replacement = `@${selectedFile.filePath} `
      }
      const before = inputValue.slice(0, mentionContext.startIndex)
      const after = inputValue.slice(
        mentionContext.startIndex + 1 + mentionContext.query.length,
      )
      setInputValue({
        text: before + replacement + after,
        cursorPosition: before.length + replacement.length,
        lastEditDueToNav: false,
      })
      setAgentSelectedIndex(0)
    },
    [
      mentionContext,
      agentMatches,
      fileMatches,
      inputValue,
      setInputValue,
      setAgentSelectedIndex,
    ],
  )

  const { inputWidth, handleBuildFast, handleBuildMax, handleBuildLite } =
    useChatInput({
      setInputValue,
      agentMode,
      setAgentMode,
      separatorWidth,
      initialPrompt,
      onSubmitPrompt,
      isCompactHeight,
      isNarrowWidth,
    })

  const {
    feedbackMode,
    feedbackText,
    openFeedbackForMessage,
    closeFeedback,
    saveCurrentInput,
    restoreSavedInput,
    setFeedbackText,
  } = useFeedbackStore(
    useShallow((state) => ({
      feedbackMode: state.feedbackMode,
      feedbackText: state.feedbackText,
      openFeedbackForMessage: state.openFeedbackForMessage,
      closeFeedback: state.closeFeedback,
      saveCurrentInput: state.saveCurrentInput,
      restoreSavedInput: state.restoreSavedInput,
      setFeedbackText: state.setFeedbackText,
    })),
  )

  const { publishMode, openPublishMode, closePublish, preSelectAgents } =
    usePublishStore(
      useShallow((state) => ({
        publishMode: state.publishMode,
        openPublishMode: state.openPublishMode,
        closePublish: state.closePublish,
        preSelectAgents: state.preSelectAgents,
      })),
    )

  const { reviewMode, closeReviewScreen } = useReviewStore(
    useShallow((state) => ({
      reviewMode: state.reviewMode,
      closeReviewScreen: state.closeReviewScreen,
    })),
  )

  const publishMutation = usePublishMutation()

  const handleCommandResult = useCallback(
    (result?: CommandResult) => {
      if (!result) return

      if (result.openFeedbackMode) {
        // Save the feedback text that was set by the command handler before opening feedback mode
        const { feedbackText, feedbackCursor } = useFeedbackStore.getState()
        saveCurrentInput('', 0)
        openFeedbackForMessage(null)
        // Restore the prefilled text after openFeedbackForMessage resets it
        if (feedbackText) {
          useFeedbackStore.getState().setFeedbackText(feedbackText)
          useFeedbackStore.getState().setFeedbackCursor(feedbackCursor)
        }
      }

      if (result.openPublishMode) {
        if (result.preSelectAgents && result.preSelectAgents.length > 0) {
          // preSelectAgents already sets publishMode: true, so don't call openPublishMode
          // which would reset the selectedAgentIds
          preSelectAgents(result.preSelectAgents)
        } else {
          openPublishMode()
        }
      }

      if (result.openChatHistory) {
        useChatHistoryStore.getState().openChatHistory()
      }

      if (result.openConfig) {
        setProviderLoginOpen(false)
        setProviderManagerOpen(false)
        setModelSelectorOpen(false)
        setSearchSetupOpen(false)
        setTokenUsageOpen(false)
        setSessionRenameOpen(false)
        setRewindOpen(false)
        setChatTransfer(null)
        setConfigOpen(true)
        setInputFocused(false)
      }

      if (result.openRewind) {
        setConfigOpen(false)
        setProviderLoginOpen(false)
        setProviderManagerOpen(false)
        setModelSelectorOpen(false)
        setSearchSetupOpen(false)
        setTokenUsageOpen(false)
        setSessionRenameOpen(false)
        setChatTransfer(null)
        setRewindOpen(true)
        setInputFocused(false)
      }

      if (result.openReviewScreen) {
        useReviewStore.getState().openReviewScreen()
      }

      if (result.openProviderLogin) {
        setConfigOpen(false)
        setProviderManagerOpen(false)
        setModelSelectorOpen(false)
        setSearchSetupOpen(false)
        setTokenUsageOpen(false)
        setSessionRenameOpen(false)
        setChatTransfer(null)
        setProviderLoginOpen(true)
        setInputFocused(false)
      }

      if (result.openProviderManager) {
        setConfigOpen(false)
        setProviderLoginOpen(false)
        setModelSelectorOpen(false)
        setSearchSetupOpen(false)
        setTokenUsageOpen(false)
        setSessionRenameOpen(false)
        setChatTransfer(null)
        setProviderManagerOpen(true)
        setInputFocused(false)
      }

      if (result.openModelSelector) {
        setConfigOpen(false)
        setProviderLoginOpen(false)
        setProviderManagerOpen(false)
        setSearchSetupOpen(false)
        setTokenUsageOpen(false)
        setModelSelectorOpen(true)
        setInputFocused(false)
      }

      if (result.openSearchSetup) {
        setConfigOpen(false)
        setProviderLoginOpen(false)
        setProviderManagerOpen(false)
        setModelSelectorOpen(false)
        setTokenUsageOpen(false)
        setSearchSetupOpen(true)
        setInputFocused(false)
      }

      if (result.openTokenUsage) {
        setConfigOpen(false)
        setProviderLoginOpen(false)
        setProviderManagerOpen(false)
        setModelSelectorOpen(false)
        setSearchSetupOpen(false)
        setTokenUsageOpen(true)
        setInputFocused(false)
      }

      if (result.openSessionRename) {
        setConfigOpen(false)
        setProviderLoginOpen(false)
        setProviderManagerOpen(false)
        setModelSelectorOpen(false)
        setSearchSetupOpen(false)
        setTokenUsageOpen(false)
        setChatTransfer(null)
        setSessionRenameOpen(true)
        setInputFocused(false)
      }

      if (result.openChatTransfer) {
        setConfigOpen(false)
        setProviderLoginOpen(false)
        setProviderManagerOpen(false)
        setModelSelectorOpen(false)
        setSearchSetupOpen(false)
        setTokenUsageOpen(false)
        setSessionRenameOpen(false)
        setChatTransfer(result.openChatTransfer)
        setInputFocused(false)
      }
    },
    [
      saveCurrentInput,
      openFeedbackForMessage,
      openPublishMode,
      preSelectAgents,
      setInputFocused,
    ],
  )

  // Helper to apply insertText for slash commands - returns true if handled
  const applySlashInsertText = useCallback(
    (selected: MatchedSlashCommand): boolean => {
      if (selected.insertText != null && slashContext.startIndex >= 0) {
        const before = inputValue.slice(0, slashContext.startIndex)
        const after = inputValue.slice(
          slashContext.startIndex + 1 + slashContext.query.length,
        )
        setInputValue({
          text: before + selected.insertText + after,
          cursorPosition: before.length + selected.insertText.length,
          lastEditDueToNav: false,
        })
        setSlashSelectedIndex(0)
        return true
      }
      return false
    },
    [slashContext, inputValue, setInputValue, setSlashSelectedIndex],
  )

  // Click handler for slash menu items - executes command or inserts text
  const handleSlashItemClick = useCallback(
    async (index: number) => {
      const selected = slashMatches[index]
      if (!selected) return

      // If the command has insertText, insert it instead of executing
      if (applySlashInsertText(selected)) return

      // Execute the selected slash command immediately
      const commandString = `/${selected.id}`
      setSlashSelectedIndex(0)

      const result = await onSubmitPrompt(commandString, agentMode)
      handleCommandResult(result)
    },
    [
      slashMatches,
      applySlashInsertText,
      setSlashSelectedIndex,
      onSubmitPrompt,
      agentMode,
      handleCommandResult,
    ],
  )

  const inputValueRef = useRef(inputValue)
  const cursorPositionRef = useRef(cursorPosition)
  useEffect(() => {
    inputValueRef.current = inputValue
  }, [inputValue])
  useEffect(() => {
    cursorPositionRef.current = cursorPosition
  }, [cursorPosition])

  const handleOpenFeedbackForMessage = useCallback(
    (
      id: string | null,
      options?: {
        category?: FeedbackCategory
        footerMessage?: string
        errors?: Array<{ id: string; message: string }>
      },
    ) => {
      saveCurrentInput(inputValueRef.current, cursorPositionRef.current)
      openFeedbackForMessage(id, options)
    },
    [saveCurrentInput, openFeedbackForMessage],
  )

  const handleMessageFeedback = useCallback(
    (
      id: string,
      options?: {
        category?: FeedbackCategory
        footerMessage?: string
        errors?: Array<{ id: string; message: string }>
      },
    ) => {
      handleOpenFeedbackForMessage(id, options)
    },
    [handleOpenFeedbackForMessage],
  )

  const handleExitFeedback = useCallback(() => {
    const { value, cursor } = restoreSavedInput()
    setInputValue({
      text: value,
      cursorPosition: cursor,
      lastEditDueToNav: false,
    })
    setInputFocused(true)
    resetHistoryNavigation()
  }, [
    restoreSavedInput,
    setInputValue,
    setInputFocused,
    resetHistoryNavigation,
  ])

  const handleCloseFeedback = useCallback(() => {
    closeFeedback()
    handleExitFeedback()
  }, [closeFeedback, handleExitFeedback])

  const handleExitPublish = useCallback(() => {
    closePublish()
    setInputFocused(true)
  }, [closePublish, setInputFocused])

  const handleReviewOptionSelect = useCallback(
    (reviewText: string) => {
      closeReviewScreen()
      setInputFocused(true)
      // Submit the review request
      onSubmitPrompt(reviewText, agentMode)
        .then((result) => handleCommandResult(result))
        .catch((error) => {
          logger.error({ error }, '[review] Failed to submit review prompt')
          showClipboardMessage('No se pudo enviar la solicitud de revisión', {
            durationMs: 3000,
          })
        })
    },
    [
      closeReviewScreen,
      setInputFocused,
      onSubmitPrompt,
      agentMode,
      handleCommandResult,
    ],
  )

  const handleCloseReviewScreen = useCallback(() => {
    closeReviewScreen()
    setInputFocused(true)
  }, [closeReviewScreen, setInputFocused])

  const closeProviderLogin = useCallback(() => {
    setProviderLoginOpen(false)
    setInputFocused(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [inputRef, setInputFocused])

  const handleProviderConfigured = useCallback(
    (provider: CustomProviderDefinition) => {
      setProviderLoginOpen(false)
      setMessages((previous) => [
        ...previous,
        getSystemMessage(
          `Proveedor ${provider.name} guardado con ${provider.models.length} modelo${provider.models.length === 1 ? '' : 's'}. Modelo activo: ${provider.models[0]!.name ?? provider.models[0]!.id}.`,
        ),
      ])
      setInputFocused(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    },
    [inputRef, setInputFocused, setMessages],
  )

  const closeModelSelector = useCallback(() => {
    setModelSelectorOpen(false)
    setInputFocused(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [inputRef, setInputFocused])

  const closeSearchSetup = useCallback(() => {
    setSearchSetupOpen(false)
    setInputFocused(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [inputRef, setInputFocused])

  const closeTokenUsage = useCallback(() => {
    setTokenUsageOpen(false)
    setInputFocused(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [inputRef, setInputFocused])

  const closeConfig = useCallback(() => {
    setConfigOpen(false)
    setInputFocused(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [inputRef, setInputFocused])

  const handleProjectContextChanged = useCallback(
    (enabled: boolean) => {
      invalidateProjectContextCache(getProjectRoot())
      if (enabled) void prefetchPersistentProjectContext()
    },
    [prefetchPersistentProjectContext],
  )

  const handleVerifiedCommitCreated = useCallback(
    (result: VerifiedCommitResult) => {
      setPendingVerifiedCommit(null)
      resumeQueue()
      setMessages((previous) => [
        ...previous,
        getSystemMessage(
          `Commit creado: ${result.hash}\n\nSummary: ${result.summary}\n\nDescription: ${result.description}`,
        ),
      ])
      setInputFocused(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    },
    [inputRef, resumeQueue, setInputFocused, setMessages],
  )

  const handleVerifiedCommitNeedsChanges = useCallback(() => {
    const request = pendingVerifiedCommit?.request.trim()
    const prefix = request
      ? `La verificación de la implementación solicitada ("${request.slice(0, 160)}") encontró este problema: `
      : 'La verificación encontró este problema: '
    setPendingVerifiedCommit(null)
    setInputValue({
      text: prefix,
      cursorPosition: prefix.length,
      lastEditDueToNav: false,
    })
    setInputFocused(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [inputRef, pendingVerifiedCommit, setInputFocused, setInputValue])

  const handleVerifiedCommitSkipped = useCallback(() => {
    setPendingVerifiedCommit(null)
    resumeQueue()
    setInputFocused(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [inputRef, resumeQueue, setInputFocused])

  const handleModelSelected = useCallback(
    (choice: ModelChoice) => {
      setModelSelectorOpen(false)
      setMessages((previous) => [
        ...previous,
        getSystemMessage(
          choice.isCodebuff
            ? 'Proveedor personalizado desactivado. Se usará el backend heredado configurado.'
            : `Modelo activo: ${choice.providerName} / ${choice.modelName}. Se aplicará al agente principal y a sus subagentes.`,
        ),
      ])
      setInputFocused(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    },
    [inputRef, setInputFocused, setMessages],
  )

  const handleReviewCustom = useCallback(() => {
    closeReviewScreen()
    setInputMode('review')
    setInputFocused(true)
  }, [closeReviewScreen, setInputMode, setInputFocused])

  const handlePublish = useCallback(
    async (agentIds: string[]) => {
      await publishMutation.mutateAsync(agentIds)
    },
    [publishMutation],
  )

  const closeRewind = useCallback(() => {
    setRewindOpen(false)
    setInputFocused(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [inputRef, setInputFocused])

  const handleRewindRestore = useCallback(
    async (checkpointId: string, mode: RewindRestoreMode) => {
      abortActiveRun()
      stopStreaming()
      // The abort path may have queued one final persistence checkpoint. Drain
      // it before saving the rewound state so a stale write cannot land after
      // restoration and silently resurrect the discarded future conversation.
      await settleCheckpointSave()
      const chatDir = resolveCurrentChatDir()
      const result = await restoreRewindCheckpoint({
        checkpointId,
        mode,
        chatDir,
        projectRoot: getProjectRoot(),
      })

      if (mode === 'conversation' || mode === 'both') {
        const restoredMessages = result.messages ?? []
        const restoredRunState = result.runState ?? null
        const saved = saveRewoundChatState(
          restoredRunState,
          restoredMessages,
          chatDir,
        )
        if (!saved) {
          throw new Error(
            'Los archivos pudieron restaurarse, pero no se pudo guardar el chat restaurado. Revisa los permisos del directorio de sesiones e inténtalo nuevamente.',
          )
        }
        const store = useChatStore.getState()
        store.setMessages(restoredMessages)
        replaceRunState(restoredRunState)
        setInputValue({
          text: result.prompt,
          cursorPosition: result.prompt.length,
          lastEditDueToNav: false,
        })
      }

      const restoredCount = result.restoredFiles.length
      const skippedCount = result.skippedFiles.length
      const scopeLabel =
        mode === 'both'
          ? 'Conversación y archivos restaurados'
          : mode === 'conversation'
            ? 'Conversación restaurada'
            : 'Archivos restaurados'
      showClipboardMessage(
        [
          scopeLabel,
          restoredCount > 0 ? `${restoredCount} archivos` : '',
          skippedCount > 0
            ? `${skippedCount} omitidos por cambios externos`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        { durationMs: 5000 },
      )
      closeRewind()
    },
    [closeRewind, replaceRunState, setInputValue, stopStreaming],
  )

  // Ensure bracketed paste events target the active chat input
  useEffect(() => {
    if (
      providerLoginOpen ||
      providerManagerOpen ||
      modelSelectorOpen ||
      searchSetupOpen ||
      tokenUsageOpen ||
      sessionRenameOpen ||
      rewindOpen ||
      configOpen ||
      pendingVerifiedCommit ||
      chatTransfer
    )
      return
    if (feedbackMode) {
      inputRef.current?.focus()
      return
    }
    if (!askUserState) {
      inputRef.current?.focus()
    }
  }, [
    feedbackMode,
    askUserState,
    inputRef,
    chatTransfer,
    configOpen,
    pendingVerifiedCommit,
    modelSelectorOpen,
    providerLoginOpen,
    providerManagerOpen,
    searchSetupOpen,
    rewindOpen,
    sessionRenameOpen,
    tokenUsageOpen,
  ])

  const handleSubmit = useCallback(async () => {
    // Update terminal title with truncated user input
    if (inputValue.trim()) {
      setTerminalTitle(getCurrentSessionName() ?? inputValue)
    }
    const result = await onSubmitPrompt(inputValue, agentMode)
    handleCommandResult(result)
  }, [onSubmitPrompt, inputValue, agentMode, handleCommandResult])

  const totalMentionMatches = agentMatches.length + fileMatches.length
  const historyNavUpEnabled =
    lastEditDueToNav ||
    (cursorPosition === 0 &&
      ((slashContext.active && slashSelectedIndex === 0) ||
        (mentionContext.active && agentSelectedIndex === 0) ||
        (!slashContext.active && !mentionContext.active)))
  const historyNavDownEnabled =
    lastEditDueToNav ||
    (cursorPosition === inputValue.length &&
      ((slashContext.active &&
        slashSelectedIndex === slashMatches.length - 1) ||
        (mentionContext.active &&
          agentSelectedIndex === totalMentionMatches - 1) ||
        (!slashContext.active && !mentionContext.active)))

  // Build keyboard state from store values
  const chatKeyboardState: ChatKeyboardState = useMemo(
    () => ({
      ...createDefaultChatKeyboardState(),
      inputMode,
      inputValue: feedbackMode ? feedbackText : inputValue,
      cursorPosition,
      isStreaming,
      isWaitingForResponse,
      feedbackMode,
      focusedAgentId,
      slashMenuActive: slashContext.active,
      mentionMenuActive: mentionContext.active,
      slashSelectedIndex,
      agentSelectedIndex,
      slashMatchesLength: slashMatches.length,
      totalMentionMatches: agentMatches.length + fileMatches.length,
      disableSlashSuggestions:
        getInputModeConfig(inputMode).disableSlashSuggestions,
      historyNavUpEnabled,
      historyNavDownEnabled,
      nextCtrlCWillExit,
      queuePaused,
      queuedCount,
    }),
    [
      inputMode,
      inputValue,
      feedbackText,
      cursorPosition,
      isStreaming,
      isWaitingForResponse,
      feedbackMode,
      focusedAgentId,
      slashContext.active,
      mentionContext.active,
      slashSelectedIndex,
      agentSelectedIndex,
      slashMatches.length,
      agentMatches.length,
      fileMatches.length,
      historyNavUpEnabled,
      historyNavDownEnabled,
      nextCtrlCWillExit,
      queuePaused,
      queuedCount,
    ],
  )

  // Keyboard handlers
  const chatKeyboardHandlers: ChatKeyboardHandlers = useMemo(
    () => ({
      onExitInputMode: () => setInputMode('default'),
      onExitFeedbackMode: handleCloseFeedback,
      onClearFeedbackInput: () => {
        setFeedbackText('')
        useFeedbackStore.getState().setFeedbackCursor(0)
      },
      onClearInput: () =>
        setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false }),
      onBackspaceExitMode: () => setInputMode('default'),
      onInterruptStream: () => {
        abortControllerRef.current?.abort()
        if (queuedMessages.length > 0) {
          pauseQueue()
        }
      },
      onSlashMenuDown: () => setSlashSelectedIndex((prev) => prev + 1),
      onSlashMenuUp: () => setSlashSelectedIndex((prev) => prev - 1),
      onSlashMenuSelect: async () => {
        const selected = slashMatches[slashSelectedIndex] || slashMatches[0]
        if (!selected) return

        // If the command has insertText, insert it instead of executing
        if (applySlashInsertText(selected)) return

        // Execute the selected slash command immediately
        const commandString = `/${selected.id}`
        setSlashSelectedIndex(0)

        const result = await onSubmitPrompt(commandString, agentMode)

        handleCommandResult(result)
      },
      onSlashMenuComplete: () => {
        // Complete the word without executing - same as clicking on the item
        const selected = slashMatches[slashSelectedIndex] || slashMatches[0]
        if (!selected || slashContext.startIndex < 0) return

        // If the command has insertText, insert it instead of the command
        if (applySlashInsertText(selected)) return

        const before = inputValue.slice(0, slashContext.startIndex)
        const after = inputValue.slice(
          slashContext.startIndex + 1 + slashContext.query.length,
        )
        const replacement = `/${selected.id} `
        setInputValue({
          text: before + replacement + after,
          cursorPosition: before.length + replacement.length,
          lastEditDueToNav: false,
        })
        setSlashSelectedIndex(0)
      },
      onMentionMenuDown: () => setAgentSelectedIndex((prev) => prev + 1),
      onMentionMenuUp: () => setAgentSelectedIndex((prev) => prev - 1),
      onMentionMenuTab: () => {
        const totalMatches = agentMatches.length + fileMatches.length
        setAgentSelectedIndex((prev) => (prev + 1) % totalMatches)
      },
      onMentionMenuShiftTab: () => {
        const totalMatches = agentMatches.length + fileMatches.length
        setAgentSelectedIndex(
          (prev) => (totalMatches + prev - 1) % totalMatches,
        )
      },
      onMentionMenuSelect: () => {
        if (mentionContext.startIndex < 0) return

        const trySelectAtIndex = (index: number): boolean => {
          let replacement: string
          if (index < agentMatches.length) {
            const selected = agentMatches[index]
            if (!selected) return false
            replacement = `@${selected.id} `
          } else {
            const fileIndex = index - agentMatches.length
            const selectedFile = fileMatches[fileIndex]
            if (!selectedFile) return false
            replacement = `@${selectedFile.filePath} `
          }
          const before = inputValue.slice(0, mentionContext.startIndex)
          const after = inputValue.slice(
            mentionContext.startIndex + 1 + mentionContext.query.length,
          )
          setInputValue({
            text: before + replacement + after,
            cursorPosition: before.length + replacement.length,
            lastEditDueToNav: false,
          })
          setAgentSelectedIndex(0)
          return true
        }

        // Try current selection, fall back to first item
        trySelectAtIndex(agentSelectedIndex) || trySelectAtIndex(0)
      },
      onMentionMenuComplete: () => {
        // Complete the word without executing - same as select for mentions
        if (mentionContext.startIndex < 0) return

        let replacement: string
        const index = agentSelectedIndex
        if (index < agentMatches.length) {
          const selected =
            agentMatches.length > 0
              ? agentMatches[index] || agentMatches[0]
              : undefined
          if (!selected) return
          replacement = `@${selected.id} `
        } else {
          const fileIndex = index - agentMatches.length
          const selectedFile =
            fileMatches.length > 0
              ? fileMatches[fileIndex] || fileMatches[0]
              : undefined
          if (!selectedFile) return
          replacement = `@${selectedFile.filePath} `
        }
        const before = inputValue.slice(0, mentionContext.startIndex)
        const after = inputValue.slice(
          mentionContext.startIndex + 1 + mentionContext.query.length,
        )
        setInputValue({
          text: before + replacement + after,
          cursorPosition: before.length + replacement.length,
          lastEditDueToNav: false,
        })
        setAgentSelectedIndex(0)
      },
      onOpenFileMenuWithTab: () => {
        const safeCursor = Math.max(
          0,
          Math.min(cursorPosition, inputValue.length),
        )
        let wordStart = safeCursor
        while (wordStart > 0 && !/\s/.test(inputValue[wordStart - 1]!)) {
          wordStart--
        }
        if (wordStart < safeCursor) {
          openFileMenuWithTab()
          return true
        }
        return false
      },
      onHistoryUp: navigateUp,
      onHistoryDown: navigateDown,
      onToggleAgentMode: toggleAgentMode,
      onUnfocusAgent: () => {
        setFocusedAgentId(null)
        setInputFocused(true)
        inputRef.current?.focus()
      },
      onClearQueue: clearQueue,
      onExitAppWarning: () => handleCtrlC(),
      onExitApp: () => handleCtrlC(),
      onBashHistoryUp: navigateUp,
      onBashHistoryDown: navigateDown,
      onPasteImage: () => {
        const placeholderPath = addClipboardPlaceholder()

        // Process the image in the background
        setTimeout(() => {
          const result = readClipboardImage()
          if (!result.success || !result.imagePath) {
            useChatStore.getState().removePendingImage(placeholderPath)
            showClipboardMessage(result.error || 'No se pudo pegar la imagen', {
              durationMs: 3000,
            })
            return
          }

          const cwd = getProjectRoot() ?? process.cwd()
          addPendingImageFromFile(result.imagePath, cwd, placeholderPath).catch(
            (error) => {
              logger.error({ error }, 'Failed to add pending image from file')
              showClipboardMessage('No se pudo agregar la imagen', {
                durationMs: 3000,
              })
            },
          )
        }, 0)
      },
      onPasteImagePath: (imagePath: string) => {
        const cwd = getProjectRoot() ?? process.cwd()
        validateAndAddImage(imagePath, cwd).catch((error) => {
          logger.error({ error, imagePath }, 'Failed to validate and add image')
          showClipboardMessage('No se pudo agregar la imagen', {
            durationMs: 3000,
          })
        })
      },
      onPasteFilePath: (filePath: string, isDirectory: boolean) => {
        addPendingFileFromPath(filePath, isDirectory)
      },
      onPasteText: (text: string) => {
        setInputValue((prev) => {
          const before = prev.text.slice(0, prev.cursorPosition)
          const after = prev.text.slice(prev.cursorPosition)
          return {
            text: before + text + after,
            cursorPosition: before.length + text.length,
            lastEditDueToNav: false,
          }
        })
      },
      onScrollUp: scrollUp,
      onScrollDown: scrollDown,
      onToggleAll: handleToggleAll,
    }),
    [
      setInputMode,
      handleCloseFeedback,
      setFeedbackText,
      setInputValue,
      abortControllerRef,
      queuedMessages.length,
      pauseQueue,
      setSlashSelectedIndex,
      slashMatches,
      slashSelectedIndex,
      slashContext,
      inputValue,
      applySlashInsertText,
      onSubmitPrompt,
      agentMode,
      handleCommandResult,
      setAgentSelectedIndex,
      agentMatches,
      fileMatches,
      agentSelectedIndex,
      mentionContext,
      cursorPosition,
      openFileMenuWithTab,
      navigateUp,
      navigateDown,
      toggleAgentMode,
      setFocusedAgentId,
      setInputFocused,
      inputRef,
      handleCtrlC,
      clearQueue,
      scrollUp,
      scrollDown,
      handleToggleAll,
    ],
  )

  // Use the chat keyboard hook
  useChatKeyboard({
    state: chatKeyboardState,
    handlers: chatKeyboardHandlers,
    disabled:
      askUserState !== null ||
      reviewMode ||
      providerLoginOpen ||
      providerManagerOpen ||
      modelSelectorOpen ||
      searchSetupOpen ||
      tokenUsageOpen ||
      sessionRenameOpen ||
      rewindOpen ||
      configOpen ||
      pendingVerifiedCommit !== null ||
      chatTransfer !== null,
  })

  // Sync message block context to zustand store for child components
  const setMessageBlockContext = useMessageBlockStore(
    (state) => state.setContext,
  )
  const setMessageBlockCallbacks = useMessageBlockStore(
    (state) => state.setCallbacks,
  )

  // Update context when values change - useLayoutEffect ensures synchronous updates
  // to prevent message loss during rapid streaming (race condition fix)
  useLayoutEffect(() => {
    setMessageBlockContext({
      theme,
      markdownPalette,
      messageTree,
      isWaitingForResponse,
      timerStartTime,
      availableWidth: messageAvailableWidth,
    })
  }, [
    theme,
    markdownPalette,
    messageTree,
    isWaitingForResponse,
    timerStartTime,
    messageAvailableWidth,
    setMessageBlockContext,
  ])

  // Update callbacks once (they're stable)
  useEffect(() => {
    setMessageBlockCallbacks({
      onToggleCollapsed: handleCollapseToggle,
      onBuildFast: handleBuildFast,
      onBuildMax: handleBuildMax,
      onBuildLite: handleBuildLite,
      onFeedback: handleMessageFeedback,
      onCloseFeedback: handleCloseFeedback,
    })
  }, [
    handleCollapseToggle,
    handleBuildFast,
    handleBuildMax,
    handleBuildLite,
    handleMessageFeedback,
    handleCloseFeedback,
    setMessageBlockCallbacks,
  ])

  const modeConfig = getInputModeConfig(inputMode)
  const hasSlashSuggestions =
    slashContext.active &&
    slashSuggestionItems.length > 0 &&
    !modeConfig.disableSlashSuggestions
  const hasMentionSuggestions =
    !slashContext.active &&
    mentionContext.active &&
    (agentSuggestionItems.length > 0 || fileSuggestionItems.length > 0)
  const hasSuggestionMenu = hasSlashSuggestions || hasMentionSuggestions


  const inputLayoutMetrics = useMemo(() => {
    // In bash mode, layout is based on the actual input (no ! prefix needed)
    const text = inputValue ?? ''
    const layoutContent = text.length > 0 ? text : ' '
    const safeCursor = Math.max(
      0,
      Math.min(cursorPosition, layoutContent.length),
    )
    const cursorProbe =
      safeCursor >= layoutContent.length
        ? layoutContent
        : layoutContent.slice(0, safeCursor)
    const cols = Math.max(1, inputWidth)
    return computeInputLayoutMetrics({
      layoutContent,
      cursorProbe,
      cols,
      maxHeight: Math.floor(terminalHeight / 2),
    })
  }, [inputValue, cursorPosition, inputWidth, terminalHeight])
  const isMultilineInput = inputLayoutMetrics.heightLines > 1
  const shouldCenterInputVertically = !hasSuggestionMenu && !isMultilineInput
  const statusIndicatorState = getStatusIndicatorState({
    statusMessage,
    streamStatus,
    nextCtrlCWillExit,
    isConnected,
    authStatus,
    showReconnectionMessage,
    isRetrying,
    isAskUserActive: askUserState !== null,
  })
  const hasStatusIndicatorContent = statusIndicatorState.kind !== 'idle'

  const inputBoxTitle = useMemo(() => {
    const segments: string[] = []

    if (queuePreviewTitle) {
      segments.push(queuePreviewTitle)
    } else if (pausedQueueText) {
      segments.push(`⏸ ${pausedQueueText}`)
    }

    if (segments.length === 0) {
      return undefined
    }

    return ` ${segments.join('   ')} `
  }, [queuePreviewTitle, pausedQueueText])

  const shouldShowStatusLine =
    !feedbackMode &&
    !providerLoginOpen &&
    !providerManagerOpen &&
    !modelSelectorOpen &&
    !searchSetupOpen &&
    !tokenUsageOpen &&
    !sessionRenameOpen &&
    !rewindOpen &&
    !configOpen &&
    pendingVerifiedCommit === null &&
    chatTransfer === null &&
    (hasStatusIndicatorContent ||
      shouldShowQueuePreview ||
      !isAtBottom ||
      hasActiveContextWindow)

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        flexGrow: 1,
      }}
    >
      <scrollbox
        ref={scrollRef as React.Ref<ScrollBoxRenderable>}
        stickyScroll
        stickyStart="bottom"
        scrollX={false}
        scrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{
          visible: !isStreaming && !isWaitingForResponse && hasOverflow,
          trackOptions: { width: 1 },
        }}
        {...appliedScrollboxProps}
        style={{
          flexGrow: 1,
          rootOptions: {
            flexGrow: 1,
            padding: 0,
            gap: 0,
            flexDirection: 'row',
            shouldFill: true,
            backgroundColor: 'transparent',
          },
          wrapperOptions: {
            flexGrow: 1,
            border: false,
            shouldFill: true,
            backgroundColor: 'transparent',
            flexDirection: 'column',
          },
          contentOptions: {
            flexDirection: 'column',
            gap: 0,
            shouldFill: true,
            justifyContent: 'flex-end',
            backgroundColor: 'transparent',
            paddingLeft: 1,
            paddingRight: 2,
          },
        }}
      >
        <TopBanner gitRoot={gitRoot} onSwitchToGitRoot={onSwitchToGitRoot} />

        <box
          ref={headerRef as React.Ref<BoxRenderable>}
          style={{ flexDirection: 'column' }}
        >
          <ChatHeader
            projectRoot={getProjectRoot()}
            animationEnabled={isHeaderVisible && inputFocused}
          />
        </box>
        {hiddenMessageCount > 0 && (
          <LoadPreviousButton
            hiddenCount={hiddenMessageCount}
            onLoadMore={handleLoadPreviousMessages}
          />
        )}
        {visibleTopLevelMessages.map((message, idx) => (
          <MessageWithAgents
            key={message.id}
            message={message}
            depth={0}
            isLastMessage={idx === visibleTopLevelMessages.length - 1}
            availableWidth={messageAvailableWidth}
          />
        ))}
        {/* Pending bash messages as ghost messages (only show those not already in history) */}
        {pendingBashMessages
          .filter((msg) => !msg.addedToHistory)
          .map((msg) => (
            <PendingBashMessage key={`pending-bash-${msg.id}`} message={msg} />
          ))}
      </scrollbox>

      <box
        style={{
          flexShrink: 0,
          backgroundColor: 'transparent',
        }}
      >

        {shouldShowStatusLine && (
          <StatusBar
            timerStartTime={timerStartTime}
            isAtBottom={isAtBottom}
            scrollToLatest={scrollToLatest}
            statusIndicatorState={statusIndicatorState}
            onStop={chatKeyboardHandlers.onInterruptStream}
          />
        )}

        {providerLoginOpen ? (
          <ProviderLoginScreen
            onComplete={handleProviderConfigured}
            onCancel={closeProviderLogin}
          />
        ) : providerManagerOpen ? (
          <ProviderManagerScreen
            onClose={() => {
              setProviderManagerOpen(false)
              setInputFocused(true)
            }}
            onOpenModels={() => {
              setProviderManagerOpen(false)
              setModelSelectorOpen(true)
            }}
          />
        ) : modelSelectorOpen ? (
          <ModelSelectorScreen
            onSelect={handleModelSelected}
            onCancel={closeModelSelector}
          />
        ) : searchSetupOpen ? (
          <SearchSetupScreen onClose={closeSearchSetup} />
        ) : tokenUsageOpen ? (
          <TokenUsageScreen onClose={closeTokenUsage} />
        ) : configOpen ? (
          <ConfigScreen
            onClose={closeConfig}
            onProjectContextChanged={handleProjectContextChanged}
          />
        ) : pendingVerifiedCommit ? (
          <VerifiedCommitScreen
            pending={pendingVerifiedCommit}
            onCommitted={handleVerifiedCommitCreated}
            onNeedsChanges={handleVerifiedCommitNeedsChanges}
            onSkip={handleVerifiedCommitSkipped}
          />
        ) : rewindOpen ? (
          <RewindScreen
            chatDir={resolveCurrentChatDir()}
            onRestore={handleRewindRestore}
            onCancel={closeRewind}
          />
        ) : sessionRenameOpen ? (
          <SessionRenameScreen
            onComplete={(name) => {
              setSessionRenameOpen(false)
              setMessages((previous) => [
                ...previous,
                getSystemMessage(`Nombre de sesión establecido: ${name}`),
              ])
              setTerminalTitle(name)
              setInputFocused(true)
            }}
            onCancel={() => {
              setSessionRenameOpen(false)
              setInputFocused(true)
            }}
          />
        ) : chatTransfer ? (
          <ChatTransferScreen
            mode={chatTransfer.mode}
            initialPath={chatTransfer.initialPath}
            onClose={() => {
              setChatTransfer(null)
              setInputFocused(true)
            }}
            onImported={(imported: ImportedChat) => {
              abortActiveRun()
              const store = useChatStore.getState()
              store.reset()
              setCurrentChatId(imported.chatId)
              store.setMessages(imported.messages)
              store.setRunState(imported.runState)
              setChatTransfer(null)
              setInputFocused(true)
              setTerminalTitle(imported.name ?? 'Chat importado')
            }}
          />
        ) : reviewMode ? (
          <ReviewScreen
            onSelectOption={handleReviewOptionSelect}
            onCustom={handleReviewCustom}
            onCancel={handleCloseReviewScreen}
          />
        ) : (
          <>
            <ChatInputBar
              inputValue={inputValue}
              cursorPosition={cursorPosition}
              setInputValue={setInputValue}
              inputFocused={inputFocused}
              inputRef={inputRef}
              inputPlaceholder={inputPlaceholder}
              lastEditDueToNav={lastEditDueToNav}
              agentMode={agentMode}
              toggleAgentMode={toggleAgentMode}
              setAgentMode={setAgentMode}
              hasSlashSuggestions={hasSlashSuggestions}
              hasMentionSuggestions={hasMentionSuggestions}
              hasSuggestionMenu={hasSuggestionMenu}
              slashSuggestionItems={slashSuggestionItems}
              agentSuggestionItems={agentSuggestionItems}
              fileSuggestionItems={fileSuggestionItems}
              slashSelectedIndex={slashSelectedIndex}
              agentSelectedIndex={agentSelectedIndex}
              onSlashItemClick={handleSlashItemClick}
              onMentionItemClick={handleMentionItemClick}
              theme={theme}
              terminalHeight={terminalHeight}
              separatorWidth={separatorWidth}
              shouldCenterInputVertically={shouldCenterInputVertically}
              inputBoxTitle={inputBoxTitle}
              isCompactHeight={isCompactHeight}
              isNarrowWidth={isNarrowWidth}
              feedbackMode={feedbackMode}
              handleExitFeedback={handleExitFeedback}
              publishMode={publishMode}
              handleExitPublish={handleExitPublish}
              handlePublish={handlePublish}
              handleSubmit={handleSubmit}
              onPaste={createPasteHandler({
                text: inputValue,
                cursorPosition,
                onChange: setInputValue,
                onPasteImage: chatKeyboardHandlers.onPasteImage,
                onPasteImagePath: chatKeyboardHandlers.onPasteImagePath,
                onPasteFilePath: chatKeyboardHandlers.onPasteFilePath,
                onPasteLongText: (pastedText) => {
                  const id = crypto.randomUUID()
                  const preview = pastedText.slice(0, 100).replace(/\n/g, ' ')
                  useChatStore.getState().addPendingTextAttachment({
                    id,
                    content: pastedText,
                    preview,
                    charCount: pastedText.length,
                  })
                  // Show temporary status message
                  showClipboardMessage(
                    `📋 Texto pegado (${pastedText.length.toLocaleString()} caracteres)`,
                    { durationMs: 5000 },
                  )
                },
                cwd: getProjectRoot() ?? process.cwd(),
              })}
              onInterruptStream={chatKeyboardHandlers.onInterruptStream}
            />
          </>
        )}
      </box>
    </box>
  )
}
