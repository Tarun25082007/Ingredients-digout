package com.digout.repositories;

import com.digout.models.CachedAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface CachedAnalysisRepository extends JpaRepository<CachedAnalysis, Long> {
    Optional<CachedAnalysis> findByProductNameIgnoreCaseAndCountryCodeIgnoreCase(String productName, String countryCode);

    @Transactional
    void deleteByCreatedAtBefore(LocalDateTime cutoff);
}
