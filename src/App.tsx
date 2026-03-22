import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Send, 
  MessageCircle, 
  X, 
  User as UserIcon, 
  LogOut, 
  ShieldCheck, 
  ChevronRight,
  Loader2,
  Clock,
  Trash2,
  Plus,
  Trash,
  Settings,
  Bell,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Message {
  id: string | number;
  text: string;
  imageUrl?: string;
  senderType: 'customer' | 'admin';
  timestamp: string;
  conversationId: string;
}

interface AutoReplyMessage {
  text: string;
  imageUrl?: string;
}

interface AutoReplySettings {
  autoReplies: AutoReplyMessage[];
  enabled: boolean;
  adminNotificationSoundUrl: string;
  customerNotificationSoundUrl: string;
  avatarUrl?: string;
  serviceName?: string;
}

interface Conversation {
  id: string;
  customerName: string;
  ip?: string;
  lastMessage: string;
  unreadCount: number;
  updatedAt: string;
  status: 'open' | 'closed';
}

// --- Components ---

const ChatBubble = ({ message, isMe }: { message: Message; isMe: boolean }) => {
  const date = message.timestamp ? (typeof message.timestamp === 'string' ? parseISO(message.timestamp) : new Date(message.timestamp)) : new Date();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex w-full mb-4",
        isMe ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] px-4 py-2 rounded-2xl text-sm shadow-sm",
          isMe 
            ? "bg-pink-500 text-white rounded-br-none" 
            : "bg-white text-gray-800 rounded-bl-none border border-pink-100"
        )}
      >
        {message.imageUrl && (
          <img 
            src={message.imageUrl} 
            alt="Message attachment" 
            className="rounded-lg mb-2 max-w-full h-auto"
            referrerPolicy="no-referrer"
          />
        )}
        {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
        <div className={cn(
          "text-[10px] mt-1 opacity-70",
          isMe ? "text-right" : "text-left"
        )}>
          {format(date, 'HH:mm')}
        </div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [adminUser, setAdminUser] = useState<{username: string} | null>(() => {
    const saved = localStorage.getItem('admin_user');
    return saved ? JSON.parse(saved) : null;
  });
  const isAdmin = !!adminUser;
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('123456');
  const [loginError, setLoginError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [initStatus, setInitStatus] = useState<string>("正在初始化...");
  const [initError, setInitError] = useState<string | null>(null);

  const [autoReply, setAutoReply] = useState<AutoReplySettings>({
    autoReplies: [{ text: '您好！欢迎咨询，请问有什么可以帮您？' }],
    enabled: true,
    adminNotificationSoundUrl: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
    customerNotificationSoundUrl: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
    avatarUrl: '',
    serviceName: '在线客服'
  });
  
  const activeConversationIdRef = useRef<string | null>(null);
  const autoReplyRef = useRef<AutoReplySettings>(autoReply);

  // Keep refs in sync with state
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    autoReplyRef.current = autoReply;
  }, [autoReply]);

  // Clear input when switching conversations
  useEffect(() => {
    setInputText('');
  }, [activeConversationId]);

  // Initialize Socket.io
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server via Socket.io');
      setInitStatus("已连接到服务器");
    });

    newSocket.on('new_message', (message: Message) => {
      // Only add to messages list if it belongs to the active conversation
      if (message.conversationId === activeConversationIdRef.current) {
        setMessages(prev => {
          if (prev.find(m => m.id === message.id)) return prev;
          return [...prev, message];
        });
      }

      // Play sound for admin if message is from customer
      if (isAdmin && message.senderType === 'customer') {
        const audio = new Audio(autoReplyRef.current.adminNotificationSoundUrl);
        audio.play().catch(e => console.error("Sound play failed:", e));
      }
      // Play sound for customer if message is from admin
      if (!isAdmin && message.senderType === 'admin') {
        const audio = new Audio(autoReplyRef.current.customerNotificationSoundUrl);
        audio.play().catch(e => console.error("Sound play failed:", e));
      }
    });

    newSocket.on('conversations_update', (convs: Conversation[]) => {
      setConversations(convs);
    });

    newSocket.on('settings_update', (settings: AutoReplySettings) => {
      setAutoReply(settings);
    });

    newSocket.on('history_cleared', () => {
      setMessages([]);
      setConversations([]);
      setActiveConversationId(null);
      localStorage.removeItem('conversation_id');
      // 重新拉取设置，确保头像和铃声不丢失
      fetch('/api/settings')
        .then(res => res.json())
        .then(settings => setAutoReply(settings))
        .catch(err => console.error("Failed to re-fetch settings:", err));
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Join rooms when state changes
  useEffect(() => {
    if (!socket) return;
    if (isAdmin) {
      socket.emit('join_admin');
    }
    if (activeConversationId) {
      socket.emit('join_conversation', activeConversationId);
    }
  }, [socket, isAdmin, activeConversationId]);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const settingsRes = await fetch('/api/settings');
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          setAutoReply(settings);
        }

        if (isAdmin) {
          const convsRes = await fetch('/api/conversations');
          if (convsRes.ok) {
            const convs = await convsRes.json();
            setConversations(convs);
          }
        }

        if (activeConversationId) {
          const messagesRes = await fetch(`/api/messages/${activeConversationId}`);
          if (messagesRes.ok) {
            const msgs = await messagesRes.json();
            setMessages(msgs);
          }
        } else {
          setMessages([]);
        }
      } catch (e) {
        console.error("Error fetching initial data:", e);
      }
    };
    fetchData();
  }, [activeConversationId, isAdmin]);

  // Customer: Find or create their own conversation
  useEffect(() => {
    if (isAdmin || activeConversationId) return;

    const initConversation = async () => {
      setInitStatus("正在初始化会话...");
      try {
        const storedId = localStorage.getItem('conversation_id');
        if (storedId) {
          setActiveConversationId(storedId);
          setInitStatus("会话已就绪");
          return;
        }

        // Fetch IP
        let ip = 'Unknown';
        try {
          const res = await fetch('https://api.ipify.org?format=json');
          const data = await res.json();
          ip = data.ip;
        } catch (e) { console.error(e); }

        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: `访客 (${ip})`,
            ip: ip
          })
        });

        if (res.ok) {
          const data = await res.json();
          setActiveConversationId(data.id);
          localStorage.setItem('conversation_id', data.id);
          setInitStatus("会话已创建");
        } else {
          setInitError("无法初始化会话，服务器响应错误。");
        }
      } catch (e) {
        console.error("Error initializing conversation:", e);
        setInitError("网络错误，无法连接到服务器。");
      }
    };

    initConversation();
  }, [isAdmin, activeConversationId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSendMessage = async (e?: React.FormEvent, imageUrl?: string) => {
    e?.preventDefault();
    if ((!inputText.trim() && !imageUrl) || !activeConversationId) return;

    const text = inputText;
    setInputText('');

    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConversationId,
          text,
          senderType: isAdmin ? 'admin' : 'customer',
          imageUrl: imageUrl || null
        })
      });
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleAdminImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId) return;

    if (file.size > 1024 * 1024) {
      alert('图片文件太大，请选择 1MB 以内的图片');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      await handleSendMessage(undefined, base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const updateAutoReply = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(autoReply)
      });
      alert('设置已保存');
      setShowSettings(false);
    } catch (error) {
      console.error("Failed to update settings:", error);
      alert('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const addAutoReplyField = () => {
    setAutoReply({
      ...autoReply,
      autoReplies: [...autoReply.autoReplies, { text: '', imageUrl: '' }]
    });
  };

  const removeAutoReplyField = (index: number) => {
    const newReplies = autoReply.autoReplies.filter((_, i) => i !== index);
    setAutoReply({ ...autoReply, autoReplies: newReplies });
  };

  const updateAutoReplyField = (index: number, field: keyof AutoReplyMessage, value: string) => {
    const newReplies = [...autoReply.autoReplies];
    newReplies[index] = { ...newReplies[index], [field]: value };
    setAutoReply({ ...autoReply, autoReplies: newReplies });
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      
      if (res.ok) {
        const data = await res.json();
        setAdminUser(data);
        localStorage.setItem('admin_user', JSON.stringify(data));
        setShowLogin(false);
      } else {
        setLoginError('用户名或密码错误');
      }
    } catch (error: any) {
      console.error("Admin login failed:", error);
      setLoginError('网络错误，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAdminUser(null);
    localStorage.removeItem('admin_user');
    window.location.reload();
  };

  const handleClearHistory = async () => {
    if (!window.confirm('确定要清理所有聊天记录吗？此操作不可撤销。')) return;
    
    setLoading(true);
    try {
      await fetch('/api/clear-history', { method: 'POST' });
      alert('清理成功');
    } catch (error) {
      console.error("Failed to clear history:", error);
      alert('清理失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'admin' | 'customer' | 'avatar') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const isImage = type === 'avatar';
    const maxSize = isImage ? 1000000 : 500000;
    
    if (file.size > maxSize) {
      alert(`文件太大，请选择小于 ${maxSize/1000}KB 的文件`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (type === 'admin') {
        setAutoReply({ ...autoReply, adminNotificationSoundUrl: base64 });
      } else if (type === 'customer') {
        setAutoReply({ ...autoReply, customerNotificationSoundUrl: base64 });
      } else if (type === 'avatar') {
        setAutoReply({ ...autoReply, avatarUrl: base64 });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleChangeAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldUsername: adminUser.username,
          newUsername: newUsername || undefined,
          newPassword: newPassword || undefined
        })
      });
      
      if (res.ok) {
        alert('账号信息修改成功，请重新登录');
        handleLogout();
      } else {
        alert('修改失败');
      }
    } catch (error: any) {
      console.error("Failed to change account info:", error);
      alert('网络错误');
    } finally {
      setLoading(false);
    }
  };

  // --- Admin View ---
  if (isAdmin) {
    return (
      <div className="min-h-[100dvh] bg-pink-50 flex flex-col md:flex-row h-[100dvh] overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          "w-full md:w-80 bg-white border-r border-pink-100 flex flex-col h-full transition-all flex-shrink-0",
          activeConversationId && "hidden md:flex"
        )}>
          <div className="p-4 border-b border-pink-100 flex items-center justify-between bg-pink-500 text-white flex-shrink-0">
            <button 
              onClick={() => {
                setShowSettings(false);
                setShowAccountSettings(false);
              }}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <ShieldCheck className="w-5 h-5" />
              <h1 className="font-bold">客服管理后台</h1>
            </button>
            <div className="flex items-center gap-2">
              <button onClick={handleClearHistory} className="p-1.5 hover:bg-pink-600 rounded-lg transition-colors" title="清理所有聊天记录">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => { setShowSettings(!showSettings); setShowAccountSettings(false); }} className={cn("p-1.5 rounded-lg hover:bg-pink-600 transition-colors", showSettings && "bg-pink-600")} title="自动回复设置">
                <Clock className="w-4 h-4" />
              </button>
              <button onClick={() => { setShowAccountSettings(!showAccountSettings); setShowSettings(false); }} className={cn("p-1.5 rounded-lg hover:bg-pink-600 transition-colors", showAccountSettings && "bg-pink-600")} title="账号设置">
                <Settings className="w-4 h-4" />
              </button>
              <button onClick={handleLogout} className="p-1.5 hover:bg-pink-600 rounded-lg transition-colors" title="退出登录">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {showSettings ? (
              <div className="p-4 bg-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-pink-50 rounded-lg text-pink-500"><X className="w-4 h-4" /></button>
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><Clock className="w-4 h-4 text-pink-500" />自动回复设置</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="enabled" checked={autoReply.enabled} onChange={(e) => setAutoReply({ ...autoReply, enabled: e.target.checked })} className="accent-pink-500" />
                    <label htmlFor="enabled" className="text-xs text-gray-700">启用</label>
                  </div>
                </div>
                
                <form onSubmit={updateAutoReply} className="space-y-6">
                  <div className="space-y-4">
                    {autoReply.autoReplies.map((reply, index) => (
                      <div key={index} className="p-3 border border-pink-50 rounded-xl bg-pink-50/20 relative group">
                        <button type="button" onClick={() => removeAutoReplyField(index)} className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Trash className="w-3 h-3" /></button>
                        <div className="space-y-2">
                          <textarea value={reply.text} onChange={(e) => updateAutoReplyField(index, 'text', e.target.value)} placeholder={`自动回复消息 ${index + 1}`} className="w-full p-2 text-base border border-pink-100 rounded-lg focus:ring-1 focus:ring-pink-500 outline-none h-20" />
                          <input type="text" value={reply.imageUrl} onChange={(e) => updateAutoReplyField(index, 'imageUrl', e.target.value)} placeholder="图片 URL (可选)" className="w-full p-2 text-xs border border-pink-100 rounded-lg focus:ring-1 focus:ring-pink-500 outline-none" />
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={addAutoReplyField} className="w-full py-2 border-2 border-dashed border-pink-200 text-pink-500 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-pink-50 transition-colors"><Plus className="w-4 h-4" />添加更多回复</button>
                  </div>

                  <div className="pt-4 border-t border-pink-50 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2 flex items-center gap-2"><MessageCircle className="w-3 h-3" />客服名称</label>
                      <input type="text" value={autoReply.serviceName || ''} onChange={(e) => setAutoReply({ ...autoReply, serviceName: e.target.value })} placeholder="例如：在线客服" className="w-full p-2 text-xs border border-pink-100 rounded-lg focus:ring-1 focus:ring-pink-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2 flex items-center gap-2"><UserIcon className="w-3 h-3" />客服头像</label>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center overflow-hidden">
                          {autoReply.avatarUrl ? <img src={autoReply.avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <UserIcon className="w-6 h-6 text-pink-300" />}
                        </div>
                        <div className="flex-1 space-y-2">
                          <input type="text" value={autoReply.avatarUrl || ''} onChange={(e) => setAutoReply({ ...autoReply, avatarUrl: e.target.value })} placeholder="头像图片 URL" className="w-full p-2 text-xs border border-pink-100 rounded-lg focus:ring-1 focus:ring-pink-500 outline-none" />
                          <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-600 rounded-lg text-[10px] transition-colors border border-pink-100"><Plus className="w-3 h-3" />上传头像<input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'avatar')} /></label>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-pink-50 space-y-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2"><Bell className="w-3 h-3" />铃声设置</h4>
                      
                      <div className="space-y-3">
                        <div className="p-3 bg-pink-50/30 rounded-xl border border-pink-50">
                          <label className="block text-[10px] font-bold text-gray-500 mb-2">管理员收到消息铃声 (MP3)</label>
                          <div className="flex gap-2 mb-2">
                            <input type="text" value={autoReply.adminNotificationSoundUrl} onChange={(e) => setAutoReply({ ...autoReply, adminNotificationSoundUrl: e.target.value })} className="flex-1 p-2 text-[10px] border border-pink-100 rounded-lg outline-none focus:ring-1 focus:ring-pink-500" placeholder="铃声 URL" />
                            <button type="button" onClick={() => new Audio(autoReply.adminNotificationSoundUrl).play()} className="px-3 py-1 bg-pink-100 text-pink-600 rounded-lg text-[10px] hover:bg-pink-200 transition-colors">试听</button>
                          </div>
                          <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-pink-50 text-pink-600 rounded-lg text-[10px] transition-colors border border-pink-100 w-full justify-center shadow-sm">
                            <Plus className="w-3 h-3" />上传本地铃声
                            <input type="file" accept="audio/mpeg" className="hidden" onChange={(e) => handleFileUpload(e, 'admin')} />
                          </label>
                        </div>

                        <div className="p-3 bg-pink-50/30 rounded-xl border border-pink-50">
                          <label className="block text-[10px] font-bold text-gray-500 mb-2">客户收到回复铃声 (MP3)</label>
                          <div className="flex gap-2 mb-2">
                            <input type="text" value={autoReply.customerNotificationSoundUrl} onChange={(e) => setAutoReply({ ...autoReply, customerNotificationSoundUrl: e.target.value })} className="flex-1 p-2 text-[10px] border border-pink-100 rounded-lg outline-none focus:ring-1 focus:ring-pink-500" placeholder="铃声 URL" />
                            <button type="button" onClick={() => new Audio(autoReply.customerNotificationSoundUrl).play()} className="px-3 py-1 bg-pink-100 text-pink-600 rounded-lg text-[10px] hover:bg-pink-200 transition-colors">试听</button>
                          </div>
                          <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-pink-50 text-pink-600 rounded-lg text-[10px] transition-colors border border-pink-100 w-full justify-center shadow-sm">
                            <Plus className="w-3 h-3" />上传本地铃声
                            <input type="file" accept="audio/mpeg" className="hidden" onChange={(e) => handleFileUpload(e, 'customer')} />
                          </label>
                        </div>
                      </div>
                    </div>
                  <button type="submit" disabled={loading} className="w-full py-3 bg-pink-500 text-white rounded-xl font-bold hover:bg-pink-600 transition-colors disabled:opacity-50">{loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "保存所有设置"}</button>
                </form>
              </div>
            ) : showAccountSettings ? (
              <div className="p-4 bg-white">
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setShowAccountSettings(false)} className="p-1 hover:bg-pink-50 rounded-lg text-pink-500"><X className="w-4 h-4" /></button>
                  <h3 className="font-bold text-gray-800 flex items-center gap-2"><Settings className="w-4 h-4 text-pink-500" />账号安全设置</h3>
                </div>
                <form onSubmit={handleChangeAccount} className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">修改登录账号 (用户名)</label>
                    <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="输入新用户名 (留空不修改)" className="w-full p-2 text-base border border-pink-100 rounded-lg focus:ring-1 focus:ring-pink-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">修改登录密码</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="输入新密码 (留空不修改)" className="w-full p-2 text-base border border-pink-100 rounded-lg focus:ring-1 focus:ring-pink-500 outline-none" />
                  </div>
                  <button type="submit" disabled={loading || (!newPassword && !newUsername)} className="w-full py-2 bg-pink-500 text-white rounded-lg font-medium hover:bg-pink-600 transition-colors disabled:opacity-50">{loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "确认修改账号信息"}</button>
                </form>
              </div>
            ) : (
              conversations.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">暂无咨询会话</div>
              ) : (
                conversations.map(conv => (
                  <button key={conv.id} onClick={() => setActiveConversationId(conv.id)} className={cn("w-full p-4 flex items-start gap-3 border-b border-pink-50 transition-colors text-left", activeConversationId === conv.id ? "bg-pink-50" : "hover:bg-pink-50/50")}>
                    <div className="w-10 h-10 rounded-full bg-pink-200 flex items-center justify-center text-pink-600 flex-shrink-0"><UserIcon className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-gray-900 truncate text-sm">{conv.customerName}</span>
                        <span className="text-[10px] text-gray-400">{conv.updatedAt ? format(parseISO(conv.updatedAt), 'MM-dd HH:mm') : ''}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-500 truncate flex-1">{conv.lastMessage}</p>
                        {conv.unreadCount > 0 && (
                          <span className="ml-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-pink-300 self-center" />
                  </button>
                ))
              )
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={cn("flex-1 flex flex-col h-full bg-white transition-all", !activeConversationId && "hidden md:flex")}>
          {activeConversationId ? (
            <>
              <div className="p-4 border-b border-pink-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActiveConversationId(null)} className="md:hidden p-1 hover:bg-pink-50 rounded-lg"><X className="w-5 h-5 text-pink-500" /></button>
                  <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-500"><UserIcon className="w-4 h-4" /></div>
                  <div>
                    <h2 className="font-medium text-gray-800 text-sm">{conversations.find(c => c.id === activeConversationId)?.customerName || '会话'}</h2>
                    <p className="text-[10px] text-gray-400">IP: {conversations.find(c => c.id === activeConversationId)?.ip || '未知'}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-pink-50/30">
                {messages.map(msg => <ChatBubble key={msg.id} message={msg} isMe={msg.senderType === 'admin'} />)}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={(e) => handleSendMessage(e)} className="p-4 border-t border-pink-100 flex gap-2 bg-white items-center flex-shrink-0">
                <label className="p-2 hover:bg-pink-50 rounded-xl text-pink-500 cursor-pointer transition-colors"><ImageIcon className="w-6 h-6" /><input type="file" accept="image/*" className="hidden" onChange={handleAdminImageUpload} /></label>
                <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="输入回复内容..." className="flex-1 px-4 py-3 rounded-2xl border border-pink-200 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none text-base transition-all" />
                <button type="submit" className="w-12 h-12 bg-pink-500 text-white rounded-2xl hover:bg-pink-600 transition-colors flex items-center justify-center shadow-lg shadow-pink-100"><Send className="w-5 h-5" /></button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400"><MessageCircle className="w-16 h-16 mb-4 opacity-20" /><p className="text-sm">请选择一个会话开始回复</p></div>
          )}
        </div>
      </div>
    );
  }

  // --- Customer View ---
  return (
    <div className="h-[100dvh] bg-pink-50 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <div className="p-2 bg-pink-500 text-white flex items-center justify-between shadow-md z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
            {autoReply.avatarUrl ? <img src={autoReply.avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <UserIcon className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-bold text-xs">{autoReply.serviceName || '在线客服'}</h3>
            <div className="flex items-center gap-1 text-[9px] opacity-80"><div className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />正在为您服务</div>
          </div>
        </div>
        <button onClick={() => setShowLogin(true)} className="p-1.5 hover:bg-white/20 rounded-full transition-colors" title="管理员登录"><ShieldCheck className="w-5 h-5" /></button>
      </div>

      {/* Login Modal */}
      <AnimatePresence>
        {showLogin && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl relative">
              <button onClick={() => setShowLogin(false)} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><ShieldCheck className="w-8 h-8 text-pink-500" /></div>
                <h2 className="text-xl font-bold text-gray-800">管理员登录</h2>
                <p className="text-xs text-gray-400 mt-1">请输入指定的账号和密码</p>
              </div>
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 ml-1">用户名</label>
                  <input type="text" required value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-transparent focus:border-pink-500 focus:bg-white focus:outline-none text-base transition-all" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 ml-1">密码</label>
                  <input type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-transparent focus:border-pink-500 focus:bg-white focus:outline-none text-base transition-all" />
                </div>
                {loginError && <p className="text-xs text-red-500 text-center">{loginError}</p>}
                <button type="submit" disabled={loading} className="w-full py-3 bg-pink-500 text-white rounded-xl font-bold hover:bg-pink-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "立即登录"}</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <div className="text-center mb-6"><span className="text-[10px] bg-pink-100 text-pink-500 px-2 py-1 rounded-full uppercase tracking-wider">今天</span></div>
        {messages.length === 0 && (
          <div className="text-center py-20">
            <Clock className="w-8 h-8 text-pink-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400">{initError || initStatus}</p>
            {initError && <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-pink-100 text-pink-500 rounded-lg text-xs">重试</button>}
          </div>
        )}
        {messages.map(msg => <ChatBubble key={msg.id} message={msg} isMe={msg.senderType === 'customer'} />)}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-pink-100 flex-shrink-0 z-20">
        <form onSubmit={handleSendMessage} className="max-w-2xl mx-auto flex gap-2">
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="请输入您的问题..." className="flex-1 px-4 py-2 rounded-2xl bg-gray-50 border border-pink-200 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 focus:outline-none text-base transition-all" />
          <button type="submit" className="w-10 h-10 bg-pink-500 text-white rounded-2xl flex items-center justify-center hover:bg-pink-600 transition-colors shadow-lg shadow-pink-100 flex-shrink-0"><Send className="w-4 h-4" /></button>
        </form>
      </div>
    </div>
  );
}
