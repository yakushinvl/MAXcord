import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useVoice } from '../contexts/VoiceContext';
import { MicIcon, MicMutedIcon, DeafenedIcon, SpeakerIcon, PhoneIcon, ScreenShareIcon, StopScreenShareIcon } from './Icons';
import ScreenSourceSelector from './ScreenSourceSelector';
import './VoiceControlPanel.css';

const VoiceControlPanel: React.FC = () => {
    const {
        activeChannelId,
        isMuted,
        toggleMute,
        isDeafened,
        toggleDeafen,
        leaveChannel,
        isScreenSharing,
        startScreenShare,
        stopScreenShare
    } = useVoice();

    const [showSourceSelector, setShowSourceSelector] = React.useState(false);

    if (!activeChannelId) return null;

    const handleShareClick = () => {
        if (isScreenSharing) {
            stopScreenShare();
        } else {
            setShowSourceSelector(true);
        }
    };

    const handleSourceSelect = (sourceId: string, options?: { resolution?: string, frameRate?: string }) => {
        startScreenShare(sourceId, options);
        setShowSourceSelector(false);
    };

    return (
        <div className="voice-control-panel glass-panel-base">
            <div className="voice-info">
                <div className="voice-status-indicator">
                    <div className="pulse-ring"></div>
                    <div className="status-dot"></div>
                </div>
                <div className="voice-details">
                    <span className="voice-connection-status">Голосовая связь</span>
                    <span className="voice-channel-name">Подключено</span>
                </div>
                <button className="voice-disconnect-btn" onClick={leaveChannel} title="Отключиться">
                    <PhoneIcon size={20} color="#ff4d4d" />
                </button>
            </div>

            <div className="voice-actions">
                <button
                    className={`voice-action-btn ${isMuted ? 'active' : ''}`}
                    onClick={toggleMute}
                    title={isMuted ? "Включить микрофон" : "Выключить микрофон"}
                >
                    {isMuted ? <MicMutedIcon size={20} color="#ff4d4d" /> : <MicIcon size={20} />}
                </button>
                <button
                    className={`voice-action-btn ${isDeafened ? 'active' : ''}`}
                    onClick={toggleDeafen}
                    title={isDeafened ? "Включить звук" : "Выключить звук"}
                >
                    {isDeafened ? <DeafenedIcon size={20} color="#ff4d4d" /> : <SpeakerIcon size={20} />}
                </button>
                <button
                    className={`voice-action-btn ${isScreenSharing ? 'sharing' : ''}`}
                    onClick={handleShareClick}
                    title={isScreenSharing ? "Остановить стрим" : "Начать стрим"}
                >
                    {isScreenSharing ? <StopScreenShareIcon size={20} color="var(--primary-neon)" /> : <ScreenShareIcon size={20} />}
                </button>
            </div>

            {showSourceSelector && createPortal(
                <ScreenSourceSelector
                    onSelect={handleSourceSelect}
                    onClose={() => setShowSourceSelector(false)}
                />,
                document.body
            )}
        </div>
    );
};

export default VoiceControlPanel;
