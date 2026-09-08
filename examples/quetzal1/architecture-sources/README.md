# Fontes adicionais de arquitetura — Quetzal-1

Arquivos preparados em 08/09/2026 para adicionar manualmente como **documentos do projeto** em Project Memory → Artifacts → Add. Envie os três `.txt`; este README, o manifesto e as licenças documentam a preparação e não são entradas de engenharia. Nenhum arquivo foi importado para o banco ou enviado ao Gemini.

| Arquivo | Conteúdo de projeto | Origem |
| --- | --- | --- |
| [ADCS-hardware.txt](ADCS-hardware.txt) | Controle magnético passivo, sensores, isolamento I²C, alimentação e montagem dos interruptores de implantação. | [Hardware ADCS oficial](https://github.com/Quetzal-1-CubeSat-Team/quetzal1-hardware/blob/d4d1b59de384701a016a6e17353aff3c8ba64853/ADCS/README.md) |
| [ADCS-software.txt](ADCS-software.txt) | Rede interna de sensores, comandos OBC–ADCS, inicialização, configuração da IMU e interface de reset do ADM. | [Software ADCS oficial](https://github.com/Quetzal-1-CubeSat-Team/quetzal1-flight-software/blob/dbfb67a2c8a7336f765e320d37a8a02e3ab4c212/ADCS/README.md) |
| [ADM-hardware.txt](ADM-hardware.txt) | Abertura de antenas, sequência comandada pelo OBC/EPS, detecção de abertura e placa compartilhada com painel solar. | [Hardware ADM oficial](https://github.com/Quetzal-1-CubeSat-Team/quetzal1-hardware/blob/d4d1b59de384701a016a6e17353aff3c8ba64853/ADM/README.md) |

Os textos são recortes identificados de documentação oficial, mantendo a redação original. Removidos: apresentação de diretórios, imagens, bibliografia e referências a resultados em órbita. Links relativos foram tornados absolutos. O cabeçalho de cada arquivo identifica a adaptação, autoria, revisão e licença. Os hashes do original e do recorte estão em [manifest.json](manifest.json). Licenças completas em [licenses](licenses).

Essas fontes descrevem implementação real, incluindo decisões feitas antes do voo. Não contêm séries de telemetria, resultados pós-voo, gabarito, relatórios de benchmark ou arquitetura pré-fabricada. A configuração usada em voo não deve ser confundida com desempenho observado durante o voo. A preparação não altera o contexto congelado do benchmark nem `docs/VALIDATED.md`.

Adicionar fontes salva contexto na memória. O modelo de um projeto já iniciado continua preservado: **Abrir concepção** não reextrai ou mescla documentos novos. A função de releitura foi removida conforme solicitado. Estes arquivos preparam a ampliação futura; não representam uma extração já validada nem tornam automaticamente novos blocos visíveis.
