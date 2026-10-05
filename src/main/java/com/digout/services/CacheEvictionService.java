package com.digout.services;

import com.digout.repositories.CachedAnalysisRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Runs a nightly maintenance job to purge cached analysis entries older than
 * 30 days, preventing the cache table from growing unboundedly.
 */
@Service
public class CacheEvictionService {

    private static final Logger log = LoggerFactory.getLogger(CacheEvictionService.class);

    private final CachedAnalysisRepository cachedAnalysisRepository;

    public CacheEvictionService(CachedAnalysisRepository cachedAnalysisRepository) {
        this.cachedAnalysisRepository = cachedAnalysisRepository;
    }

    /** Runs every day at 03:00 AM server time. */
    @Scheduled(cron = "0 0 3 * * *")
    public void evictStaleCache() {
        LocalDateTime cutoff = LocalDateTime.now(java.time.ZoneOffset.UTC).minusDays(30);
        cachedAnalysisRepository.deleteByCreatedAtBefore(cutoff);
        log.info("[CacheEviction] Purged analysis cache entries older than 30 days.");
    }
}
