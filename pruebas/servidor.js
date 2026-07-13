import http from "http";

const frases = [
  "¡Cree en ti mismo y todo será posible! 💪",
  "Cada día es una nueva oportunidad para brillar. ✨",
  "El éxito es la suma de pequeños esfuerzos repetidos día tras día. 🔥",
  "No te rindas, las grandes cosas toman tiempo. ⏳",
  "Eres más fuerte de lo que crees. 🚀",
  "Hoy es un buen día para ser feliz. 😊",
  "La disciplina vence al talento cuando el talento no se disciplina. 🎯",
  "Tu único límite es tu mente. 🧠",
  "Sigue adelante, el mejor momento es ahora. 🌟",
  "Los sueños no funcionan a menos que tú lo hagas. ⚡",
  "Si puedes soñarlo, puedes lograrlo. 🌈",
  "Nunca es tarde para empezar de nuevo. 🌅",
];

const server = http.createServer((req, res) => {
  const fraseAleatoria = frases[Math.floor(Math.random() * frases.length)];

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Frases Motivadoras</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .container {
          text-align: center;
          padding: 2rem;
          max-width: 600px;
        }
        h1 {
          font-size: 2.5rem;
          margin-bottom: 1rem;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        .frase {
          font-size: 1.8rem;
          font-weight: 300;
          background: rgba(255,255,255,0.15);
          padding: 2rem;
          border-radius: 16px;
          backdrop-filter: blur(10px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          animation: fadeIn 0.5s ease-in;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        button {
          margin-top: 2rem;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          border: 2px solid white;
          background: transparent;
          color: white;
          border-radius: 50px;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        button:hover {
          background: white;
          color: #667eea;
          transform: scale(1.05);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🌟 Frase Motivadora 🌟</h1>
        <div class="frase">${fraseAleatoria}</div>
        <button onclick="location.reload()">🔄 ¡Otra frase!</button>
      </div>
    </body>
    </html>
  `);
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log("¡Presiona Ctrl+C para detenerlo!");
});
