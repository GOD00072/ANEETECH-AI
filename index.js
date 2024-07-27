const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs').promises;
const axios = require('axios');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const app = express();
const port = 3000;


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './'); // Save files to the root of the project directory
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const MODEL_NAME = "gemini-1.5-pro";
const API_KEY = "AIzaSyD1TYAorQ6bItKk3-tVcasYHnM-o3S4DfA"; // Replace with your API key
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(API_KEY);

const generationConfig = {
  temperature: 1,
  topK: 0,
  topP: 0.90,
  maxOutputTokens: 82999,
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

const model = genAI.getGenerativeModel({ model: MODEL_NAME, safetySettings });

async function loadChatHistoryFromFile(filePath) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Chat history file not found.');
      return null;
    } else {
      console.error('Error loading:', error);
      return null;
    }
  }
}

async function loadOrCreateChatHistory(userId) {
  const chatHistoryFile = `${userId}.json`;
  let chatHistory = await loadChatHistoryFromFile(chatHistoryFile);

  if (!chatHistory) {
    console.log('Found new customer, system is processing.');
    const defaultChatFile = '777.json';
    const defaultChatHistory = await loadChatHistoryFromFile(defaultChatFile);
    if (defaultChatHistory) {
      chatHistory = defaultChatHistory;
      await fs.writeFile(chatHistoryFile, JSON.stringify(chatHistory));
    } else {
      console.log('Not found.');
      chatHistory = [];
    }
  }

  return chatHistory;
}

async function saveChatHistoryToFile(userId, chatHistory) {
  const chatHistoryFile = `${userId}.json`;
  try {
    let existingChatHistory = await loadChatHistoryFromFile(chatHistoryFile);
    
    if (!existingChatHistory) {
      existingChatHistory = [];
    }
    
    chatHistory.forEach((entry) => {
      const isDuplicate = existingChatHistory.some(
        (existing) =>
          existing.role === entry.role && JSON.stringify(existing.parts) === JSON.stringify(entry.parts)
      );
      if (!isDuplicate) {
        existingChatHistory.push(entry);
      }
    });

    await fs.writeFile(chatHistoryFile, JSON.stringify(existingChatHistory, null, 2));
  } catch (error) {
    console.error('Error saving chat history:', error);
  }
}

async function sendLoadingAnimation(userId, loadingSeconds) {
  const lineLoadingUrl = 'https://api.line.me/v2/bot/chat/loading/start';
  const channelAccessToken = 'XtP0q7WFPsW0EHtyswA0zzJLbWFQA0e/Bsgl5Cm5SHjFAFutkNkSi5GU2GI/4zWAxKtQL5dZVbRINfWzX/NIOBdfP0biE4mZj9V2Y24CnNVlS0mmu0TkT+wNNDcZ1+k1AuUCpXmgUCr8YbiyGeLCNgdB04t89/1O/w1cDnyilFU='; // Replace with your channel access token

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer XtP0q7WFPsW0EHtyswA0zzJLbWFQA0e/Bsgl5Cm5SHjFAFutkNkSi5GU2GI/4zWAxKtQL5dZVbRINfWzX/NIOBdfP0biE4mZj9V2Y24CnNVlS0mmu0TkT+wNNDcZ1+k1AuUCpXmgUCr8YbiyGeLCNgdB04t89/1O/w1cDnyilFU=`,
  };

  const body = {
    chatId: userId,
    loadingSeconds: loadingSeconds,
  };

  try {
    const response = await axios.post(lineLoadingUrl, body, { headers: headers });
    if (response.status === 200) {
      console.log('Loading animation sent successfully.');
    } else {
      console.error('Failed to send loading animation.');
    }
  } catch (error) {
    console.error('Error sending loading animation:', error);
  }
}


app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text;
      const userId = event.source.userId;

      const profileUrl = `https://api.line.me/v2/bot/profile/${userId}`;
      
      try {
        const response = await axios.get(profileUrl, {
          headers: {
            Authorization: 'Bearer XtP0q7WFPsW0EHtyswA0zzJLbWFQA0e/Bsgl5Cm5SHjFAFutkNkSi5GU2GI/4zWAxKtQL5dZVbRINfWzX/NIOBdfP0biE4mZj9V2Y24CnNVlS0mmu0TkT+wNNDcZ1+k1AuUCpXmgUCr8YbiyGeLCNgdB04t89/1O/w1cDnyilFU='
          }
        });

        const displayName = response.data.displayName;
        console.log('Display Name:', displayName);
        console.log('User Message:', userMessage);
        
      } catch (error) {
        console.error('Error getting profile:', error);
      }

      let userChatHistory = await loadOrCreateChatHistory(userId);

      await sendLoadingAnimation(userId, 20);

      const chat = model.startChat({
        generationConfig,
        safetySettings,
        history: userChatHistory,
      });

      const result = await chat.sendMessage(userMessage);
      const aiResponse = result.response.text();

      userChatHistory.push({
        role: 'user',
        parts: [{ text: userMessage }],
      });

      userChatHistory.push({
        role: 'model',
        parts: [{ text: aiResponse }],
      });

      await saveChatHistoryToFile(userId, userChatHistory);

      const replyToken = event.replyToken;
      const lineReplyUrl = 'https://api.line.me/v2/bot/message/reply';
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer XtP0q7WFPsW0EHtyswA0zzJLbWFQA0e/Bsgl5Cm5SHjFAFutkNkSi5GU2GI/4zWAxKtQL5dZVbRINfWzX/NIOBdfP0biE4mZj9V2Y24CnNVlS0mmu0TkT+wNNDcZ1+k1AuUCpXmgUCr8YbiyGeLCNgdB04t89/1O/w1cDnyilFU=', 
      };


  const numberRegex = /[\d,]+/;  // Matches digits and commas
const matchedNumbers = aiResponse.split('\n')[0].match(numberRegex);
const numberToSend = matchedNumbers ? matchedNumbers[0] : 'No numbers found';

// Prepare text message object
const textMessage = {
  type: 'text',
  text: `${aiResponse.trim()}`,
};

// Prepare flex message object
const flexMessage = {
  type: 'flex',
            altText: 'Book Appointment',
            contents: {
              type: 'bubble',
              hero: {
                type: 'image',
                url: 'https://st2.depositphotos.com/5592054/10810/v/380/depositphotos_108100060-stock-illustration-handyman-running-with-a-toolbox.jpg',
                size: 'full',
                aspectRatio: '20:13',
                aspectMode: 'cover',
                action: {
                  type: 'uri',
                  uri: 'https://aneetech-reservation.onrender.com'
                }
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: 'จองคิว สำหรับ ดูหน้างาน ',
                    weight: 'bold',
                    size: 'xl',
                    margin: 'md'
                  },
                  {
                    type: 'button',
                    action: {
                      type: 'uri',
                      label: 'คลิกเพื่อจอง',
                      uri: 'https://aneetech-reservation.onrender.com'
                    },
                    style: 'primary'
                  }
      ],
    },
  },
};

const keywords = ['ปุ่มด้านล่าง','ปุ่มด้าน ล่าง'];
const foundKeywordLine = aiResponse.split('\n').find(line => keywords.some(keyword => line.includes(keyword)));

let textAfterKeyword = '';
if (foundKeywordLine) {
  const keyword = keywords.find(keyword => foundKeywordLine.includes(keyword));
  textAfterKeyword = foundKeywordLine.split(keyword)[1].trim();
}

let body;
if (textAfterKeyword) {
  flexMessage.contents.body.contents[0].text = `จองคิวได้ที่ปุ่มด้่านล่างคะ 👇👇`;
  body = {
    replyToken: replyToken,
    messages: [textMessage, flexMessage], 
  };
} else {
  body = {
    replyToken: replyToken,
    messages: [textMessage],
  };
}

      try {
        await axios.post(lineReplyUrl, body, { headers: headers });
        console.log('Messages sent successfully.');
      } catch (error) {
        console.error('Error sending messages:', error);
      }
    }
  }  
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index2.html'));
});

// Route for file upload
app.post('/upload', upload.single('file'), (req, res) => {
  res.send('File uploaded successfully');
});

// Route for listing files
app.get('/files', async (req, res) => {
  try {
    const files = await fs.readdir('./'); // อ่านไฟล์ในไดเรกทอรีปัจจุบัน
    res.json(files);
  } catch (err) {
    res.status(500).send('Unable to scan files');
  }
});


// Route for downloading a file
app.get('/download/:filename', (req, res) => {
  const file = path.join(__dirname, req.params.filename);
  res.download(file);
});

// Route for deleting a file
app.delete('/delete/:filename', (req, res) => {
  const file = path.join(__dirname, req.params.filename);
  fs.unlink(file, (err) => {
    if (err) {
      return res.status(500).send('File not found');
    }
    res.send('File deleted successfully');
  });
});


app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

