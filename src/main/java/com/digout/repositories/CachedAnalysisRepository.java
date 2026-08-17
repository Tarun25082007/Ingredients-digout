package com.digout.repositories;

import com.digout.models.CachedAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CachedAnalysisRepository extends JpaRepository<CachedAnalysis, Long> {
    Optional<CachedAnalysis> findByProductNameIgnoreCase(String productName);
}
