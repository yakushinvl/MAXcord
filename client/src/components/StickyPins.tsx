import React, { useState } from 'react';
import { Message } from '../types';
import { PinIcon, ChevronDownIcon, ChevronUpIcon } from './Icons';
import UserAvatar from './UserAvatar';
import './StickyPins.css';

interface StickyPinsProps {
    pinnedMessages: Message[];
    onOpenPins: () => void;
}

const StickyPins: React.FC<StickyPinsProps> = ({ pinnedMessages, onOpenPins }) => {
    if (pinnedMessages.length === 0) return null;

    const latestPin = pinnedMessages[0];

    return (
        <div className="sticky-pins-container" onClick={onOpenPins}>
            <div className="sticky-pin-header">
                <div className="sticky-pin-icon-wrap">
                    <PinIcon size={14} fill="var(--primary-neon)" color="var(--primary-neon)" />
                </div>
                <div className="sticky-pin-content">
                    <span className="sticky-pin-label">Закрепленное сообщение</span>
                    <div className="sticky-pin-snippet">
                        <strong>{latestPin.author.username}:</strong> {latestPin.content || (latestPin.attachments?.length ? 'Вложение' : '')}
                    </div>
                </div>
                <div className="sticky-pin-count">
                    {pinnedMessages.length > 1 ? `+${pinnedMessages.length - 1}` : ''}
                    <ChevronDownIcon size={18} />
                </div>
            </div>
        </div>
    );
};

export default StickyPins;
