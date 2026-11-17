const CHAT_COMPLETIONS_URL =
  'https://router.huggingface.co/v1/chat/completions'

const SYSTEM_PROMPT =
  "Jesteś Studybotem – cierpliwym tutorem AI uczącym metodą Sokratesa po polsku. Nigdy nie podawaj gotowych definicji ani rozwiązań od razu. Zamiast tego prowadź ucznia przez aktualny temat zadając jedno krótkie, naprowadzające pytanie na raz. Jeśli uczeń napisze 'nie wiem', podaj prostą analogię z życia codziennego i zadaj łatwiejsze pytanie. Odpowiadaj zwięźle i przyjaźnie."

export type HfChatMessage = {
  role: 'assistant' | 'user'
  content: string
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
  error?: string | { message?: string }
}

function getErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return undefined
  }

  const error = (payload as ChatCompletionResponse).error
  if (typeof error === 'string') return error
  return error?.message
}

export async function getHfReply(
  topic: string,
  history: HfChatMessage[],
): Promise<string> {
  const apiKey = import.meta.env.VITE_HF_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'Brak klucza API Hugging Face. Dodaj VITE_HF_API_KEY do pliku .env.',
    )
  }

  let response: Response
  let responseText: string
  try {
    response = await fetch(CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen2.5-72B-Instruct',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: `Aktualny temat nauki: ${topic}` },
          ...history,
        ],
      }),
    })
    responseText = await response.text()
  } catch {
    throw new Error(
      'Nie udało się połączyć z Hugging Face. Sprawdź połączenie internetowe i spróbuj ponownie.',
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(responseText) as unknown
  } catch {
    payload = undefined
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Hugging Face odrzuciło klucz API. Sprawdź jego wartość i uprawnienia.',
      )
    }
    if (response.status === 429) {
      throw new Error(
        'Hugging Face ograniczyło liczbę zapytań. Spróbuj ponownie za chwilę.',
      )
    }

    const detail = getErrorMessage(payload)
    throw new Error(
      `Nie udało się uzyskać odpowiedzi z Hugging Face (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`,
    )
  }

  if (!payload || typeof payload !== 'object' || !('choices' in payload)) {
    throw new Error('Hugging Face zwróciło odpowiedź w nieprawidłowym formacie.')
  }

  const content = (payload as ChatCompletionResponse).choices?.[0]?.message
    ?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Hugging Face zwróciło pustą odpowiedź. Spróbuj ponownie.')
  }

  return content.trim()
}
