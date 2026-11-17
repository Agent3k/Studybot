import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { getHfReply, type HfChatMessage } from './services/hfService'
import './App.css'

type Topic = {
  id: number
  name: string
  progress: number
}

type Message = {
  id: number
  role: 'assistant' | 'user'
  text: string
  isError?: boolean
}

function App() {
  const [topicDraft, setTopicDraft] = useState('')
  const [topics, setTopics] = useState<Topic[]>([])
  const [activeTopicId, setActiveTopicId] = useState<number | null>(null)
  const [messagesByTopic, setMessagesByTopic] = useState<
    Record<number, Message[]>
  >({})
  const [generatingTopicIds, setGeneratingTopicIds] = useState<number[]>([])
  const [messageDraft, setMessageDraft] = useState('')
  const nextId = useRef(0)
  const inFlightTopicIds = useRef(new Set<number>())

  const activeTopic = topics.find((topic) => topic.id === activeTopicId)
  const completedCount = topics.filter((topic) => topic.progress === 100).length
  const activeMessages = activeTopicId !== null
    ? messagesByTopic[activeTopicId] ?? []
    : []
  const isActiveGenerating =
    activeTopicId !== null && generatingTopicIds.includes(activeTopicId)

  async function requestTutorReply(topic: Topic, history: Message[]) {
    if (inFlightTopicIds.current.has(topic.id)) return

    inFlightTopicIds.current.add(topic.id)
    setGeneratingTopicIds((currentIds) => [...currentIds, topic.id])

    try {
      const conversation: HfChatMessage[] = history
        .filter((message) => !message.isError)
        .map(({ role, text }) => ({ role, content: text }))
      const reply = await getHfReply(topic.name, conversation)
      setMessagesByTopic((currentMessages) => ({
        ...currentMessages,
        [topic.id]: [
          ...(currentMessages[topic.id] ?? []),
          { id: nextId.current++, role: 'assistant', text: reply },
        ],
      }))
    } catch (error) {
      const errorText =
        error instanceof Error
          ? error.message
          : 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.'
      setMessagesByTopic((currentMessages) => ({
        ...currentMessages,
        [topic.id]: [
          ...(currentMessages[topic.id] ?? []),
          {
            id: nextId.current++,
            role: 'assistant',
            text: errorText,
            isError: true,
          },
        ],
      }))
    } finally {
      inFlightTopicIds.current.delete(topic.id)
      setGeneratingTopicIds((currentIds) =>
        currentIds.filter((id) => id !== topic.id),
      )
    }
  }

  function startLearning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const names = [...new Set(
      topicDraft
        .split('\n')
        .map((name) => name.trim())
        .filter(Boolean),
    )]

    if (names.length === 0) return

    const newTopics = names.map((name) => ({
      id: nextId.current++,
      name,
      progress: 0,
    }))
    setTopics(newTopics)
    setMessagesByTopic(Object.fromEntries(newTopics.map((topic) => [topic.id, []])))
    setActiveTopicId(newTopics[0].id)
    setMessageDraft('')
    void requestTutorReply(newTopics[0], [])
  }

  function selectTopic(topic: Topic) {
    setActiveTopicId(topic.id)
    const history = messagesByTopic[topic.id] ?? []
    if (history.length === 0) {
      void requestTutorReply(topic, history)
    }
  }

  function markTopicMastered() {
    if (activeTopicId === null) return
    setTopics((currentTopics) =>
      currentTopics.map((topic) =>
        topic.id === activeTopicId ? { ...topic, progress: 100 } : topic,
      ),
    )
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = messageDraft.trim()
    if (
      !text ||
      activeTopicId === null ||
      !activeTopic ||
      inFlightTopicIds.current.has(activeTopicId)
    ) return

    const newMessage: Message = {
      id: nextId.current++,
      role: 'user',
      text,
    }

    setMessagesByTopic((currentMessages) => ({
      ...currentMessages,
      [activeTopicId]: [...(currentMessages[activeTopicId] ?? []), newMessage],
    }))
    setMessageDraft('')
    void requestTutorReply(activeTopic, [...activeMessages, newMessage])
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <main className="studybot">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>Studybot</span>
        </div>

        <form className="topic-form" onSubmit={startLearning}>
          <label htmlFor="topic-list">Twoje tematy</label>
          <p className="field-hint">Wpisz każdy temat w osobnej linii.</p>
          <textarea
            id="topic-list"
            className="topic-input"
            placeholder={'Podstawy biologii\nFunkcje matematyczne'}
            value={topicDraft}
            onChange={(event) => setTopicDraft(event.target.value)}
            rows={4}
          />
          <button className="primary-button start-button" type="submit">
            Rozpocznij naukę
            <span aria-hidden="true">↗</span>
          </button>
        </form>

        <section className="topic-section" aria-label="Postęp nauki">
          <div className="section-heading">
            <h2>Twój postęp</h2>
            <span className="progress-count">
              {completedCount}<span className="count-divider">/</span>{topics.length}
            </span>
          </div>

          {topics.length > 0 ? (
            <ul className="topic-list">
              {topics.map((topic) => (
                <li key={topic.id}>
                  <button
                    className={`topic-item${topic.id === activeTopicId ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => selectTopic(topic)}
                    aria-current={topic.id === activeTopicId ? 'true' : undefined}
                  >
                    <span className="topic-item-top">
                      <span className="topic-name">{topic.name}</span>
                      <span className="topic-percent">{topic.progress}%</span>
                    </span>
                    <span className="progress-track" aria-hidden="true">
                      <span
                        className="progress-fill"
                        style={{ width: `${topic.progress}%` }}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-topics">
              Dodaj tematy, aby śledzić swoje postępy w nauce.
            </p>
          )}
        </section>

        <div className="sidebar-footer">
          <span className="status-dot" />
          Twoja nauka, we własnym tempie
        </div>
      </aside>

      <section className="workspace" aria-label="Przestrzeń nauki">
        <header className="workspace-header">
          <div className="current-topic">
            <span className="eyebrow">AKTUALNY TEMAT</span>
            <h1>{activeTopic?.name ?? 'Wybierz temat, aby rozpocząć'}</h1>
          </div>
          <button
            className="master-button"
            type="button"
            onClick={markTopicMastered}
            disabled={!activeTopic || activeTopic.progress === 100}
          >
            <span className="master-check" aria-hidden="true">
              {activeTopic?.progress === 100 ? '✓' : ''}
            </span>
            {activeTopic?.progress === 100
              ? 'Temat opanowany'
              : 'Opanowałem ten temat'}
          </button>
        </header>

        <div className="chat-area" aria-live="polite">
          {activeMessages.length > 0 || isActiveGenerating ? (
            <div className="messages">
              {activeMessages.map((message) => (
                <article
                  className={`message message-${message.role}`}
                  key={message.id}
                >
                  {message.role === 'assistant' && (
                    <span className="assistant-avatar" aria-hidden="true">S</span>
                  )}
                  <p>{message.text}</p>
                </article>
              ))}
              {isActiveGenerating && (
                <article className="message message-assistant">
                  <span className="assistant-avatar" aria-hidden="true">S</span>
                  <p>Studybot pisze...</p>
                </article>
              )}
            </div>
          ) : (
            <div className="welcome">
              <span className="welcome-mark" aria-hidden="true">S</span>
              <h2>Zróbmy dziś mały postęp.</h2>
              <p>
                Dodaj tematy po lewej stronie, a potem wybierz, od czego chcesz
                zacząć.
              </p>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="message-input">
            Twoja wiadomość
          </label>
          <textarea
            id="message-input"
            placeholder={
              activeTopic ? 'Napisz wiadomość...' : 'Najpierw wybierz temat'
            }
            value={messageDraft}
            onChange={(event) => setMessageDraft(event.target.value)}
            onKeyDown={handleMessageKeyDown}
            rows={1}
            disabled={!activeTopic}
          />
          <button
            className="send-button"
            type="submit"
            aria-label="Wyślij wiadomość"
            disabled={!activeTopic || !messageDraft.trim() || isActiveGenerating}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3.5 10h12m-5-5 5 5-5 5" />
            </svg>
          </button>
          <span className="composer-hint">Enter, aby wysłać · Shift + Enter, nowa linia</span>
        </form>
      </section>
    </main>
  )
}

export default App
