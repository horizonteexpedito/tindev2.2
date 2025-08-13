import { type NextRequest, NextResponse } from "next/server"

// Cache em memória para armazenar os resultados e evitar chamadas repetidas à API.
// Isto ajuda a evitar o erro "429 Too Many Requests".
// Nota: Este cache é reiniciado sempre que a instância da sua função serverless é reiniciada.
const phoneCache = new Map<string, any>()

// Função principal que lida com as requisições POST
export async function POST(request: NextRequest) {
  // JSON-default de retorno em caso de falha da API externa ou foto privada
  const fallbackPayload = {
    success: true,
    result:
      "https://media.istockphoto.com/id/1337144146/vector/default-avatar-profile-icon-vector.jpg?s=612x612&w=0&k=20&c=BIbFwuv7FxTWvh5S3vB6bkT0Qv8Vn8N5Ffseq84ClGI=",
    is_photo_private: true,
  }

  try {
    // 1. Pega o número de telefone do corpo da requisição
    const { phone } = await request.json()

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Número de telefone é obrigatório" },
        { status: 400 },
      )
    }

    // 2. Limpa e formata o número de telefone (exemplo para Brasil)
    const cleanPhone = phone.replace(/[^0-9]/g, "")
    // Adapte esta lógica se precisar de outros códigos de país
    let fullNumber = cleanPhone
    if (!cleanPhone.startsWith("55") && cleanPhone.length >= 11) {
      fullNumber = "55" + cleanPhone
    }

    // --- VERIFICAÇÃO DE CACHE ---
    if (phoneCache.has(fullNumber)) {
      console.log(`CACHE HIT: Retornando dados do cache para o número: ${fullNumber}`)
      return NextResponse.json(phoneCache.get(fullNumber), {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      })
    }
    console.log(`CACHE MISS: Buscando dados da API para o número: ${fullNumber}`)
    // --- FIM DA VERIFICAÇÃO DE CACHE ---

    // 3. Monta a URL e as opções para a nova API (RapidAPI)
    // CORREÇÃO: Host alterado de 'whatsapp-datai' para 'whatsapp-data1' para corrigir o erro 404.
    const apiUrl = `https://whatsapp-data1.p.rapidapi.com/number/${fullNumber}`
    const apiOptions = {
      method: "GET",
      headers: {
        // A sua chave da API deve vir de uma variável de ambiente!
        "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
        "x-rapidapi-host": "whatsapp-data1.p.rapidapi.com",
      },
      // Mantém o timeout de 10 segundos
      signal: AbortSignal.timeout?.(10_000),
    }

    // 4. Faz a chamada para a nova API
    const response = await fetch(apiUrl, apiOptions)

    // Se a API externa falhar, devolvemos o payload padrão com status 200
    if (!response.ok) {
      console.error(
        `RapidAPI retornou um erro: ${response.status}`,
        await response.text(),
      )
      return NextResponse.json(fallbackPayload, { status: 200 })
    }

    const data = await response.json()

    // DEBUG: Imprime a resposta da API para você ver a estrutura
    console.log("Resposta da RapidAPI:", data)

    // 5. Verifica se a foto é privada ou se não veio um link válido
    const imageUrl = data?.result
    const isPhotoPrivate = !imageUrl || imageUrl.includes("g.gif") // A API costuma retornar 'g.gif' para fotos privadas

    const finalPayload = {
      success: true,
      result: isPhotoPrivate ? fallbackPayload.result : imageUrl,
      is_photo_private: isPhotoPrivate,
    }

    // Armazena o resultado bem-sucedido no cache antes de retornar
    phoneCache.set(fullNumber, finalPayload)

    return NextResponse.json(finalPayload, {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    })
  } catch (err) {
    console.error("Erro no handler da API:", err)
    // Nunca deixamos propagar status 500; devolvemos o fallback
    return NextResponse.json(fallbackPayload, { status: 200 })
  }
}

// Handler para requisições OPTIONS (necessário para CORS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
